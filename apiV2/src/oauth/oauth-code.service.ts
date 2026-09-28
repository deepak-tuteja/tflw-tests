import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { AuthService } from '../auth/auth.service';
import { TokensService } from '../auth/tokens.service';
import { parseDurationMs } from '../auth/ms';
import { OauthAuthorizeFormDto, OauthAuthorizeQueryDto } from './dto/oauth-authorize.dto';
import { OauthTokenDto } from './dto/oauth-token.dto';
import type { OauthTokenResponse } from './oauth.service';

/** An authorize request that passed every check — what the consent page carries forward. */
export interface AuthorizeRequest {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
  scope?: string;
}

interface IssuedCode {
  clientId: string;
  redirectUri: string;
  challenge: string;
  userId: string;
  scope?: string;
  expiresAt: number;
}

interface IssuedRefresh {
  clientId: string;
  userId: string;
  scope?: string;
}

const CODE_TTL_MS = 60_000;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

// tflw `M248` / this repo's `T-2`: the authorization-code grant with PKCE (RFC 6749 §4.1, RFC 7636),
// for tflw's `session … oauth2 code` to sign in against a real consent page rather than a fixture.
// One public client (no secret — the case PKCE exists for) whose redirect must be a loopback `http`
// URL on any port (RFC 8252 §7.3), which is what a CLI's listener is. Codes and refresh tokens live
// in memory: this is a single-process dogfood target, restarted per run, and a table would add a
// migration for state that is meant to die with the process. A code is single-use, lives a minute,
// and is bound to the challenge, the client and the redirect it was issued for; the exchange checks
// all three. A refresh token rotates on use.
@Injectable()
export class OauthCodeService {
  private readonly codes = new Map<string, IssuedCode>();
  private readonly refreshTokens = new Map<string, IssuedRefresh>();

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
    private readonly config: ConfigService,
  ) {}

  publicClientId(): string {
    return this.config.get<string>('OAUTH_SSO_CLIENT_ID', 'tflw-sso-cli');
  }

  private ttl(): string {
    return this.config.get<string>('OAUTH_SSO_ACCESS_TTL', '1h');
  }

  /** Every check an authorize request must pass before a page is shown to anyone. Throws with the
   * reason; per RFC 6749 §4.1.2.1 a bad client or redirect is never redirected to. */
  validate(q: OauthAuthorizeQueryDto): AuthorizeRequest {
    if (q.client_id !== this.publicClientId()) throw new BadRequestException(`unknown client_id ${JSON.stringify(q.client_id ?? '')}`);
    const redirectUri = q.redirect_uri ?? '';
    let url: URL;
    try {
      url = new URL(redirectUri);
    } catch {
      throw new BadRequestException('redirect_uri is not a URL');
    }
    if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) {
      throw new BadRequestException('redirect_uri must be a loopback http URL (127.0.0.1, localhost or [::1])');
    }
    if (q.response_type !== 'code') throw new BadRequestException('response_type must be "code"');
    if (q.code_challenge_method !== 'S256') throw new BadRequestException('code_challenge_method must be "S256"');
    if (!q.code_challenge || !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge)) throw new BadRequestException('code_challenge must be a base64url SHA-256 (43 characters)');
    if (!q.state) throw new BadRequestException('state is required');
    return { clientId: q.client_id, redirectUri, challenge: q.code_challenge, state: q.state, ...(q.scope ? { scope: q.scope } : {}) };
  }

  /** The consent form's answer. Returns where to send the browser: the redirect with a code, or
   * with `error=access_denied` when the person chose *Deny*. Wrong credentials throw — the page
   * is shown again rather than the client being told anything. */
  async decide(form: OauthAuthorizeFormDto): Promise<string> {
    const req = this.validate(form);
    const target = new URL(req.redirectUri);
    if (form.decision === 'deny') {
      target.searchParams.set('error', 'access_denied');
      target.searchParams.set('error_description', 'the user denied the request');
    } else {
      const user = await this.auth.validateCredentials(form.email ?? '', form.password ?? '');
      const code = randomBytes(24).toString('base64url');
      this.codes.set(code, { clientId: req.clientId, redirectUri: req.redirectUri, challenge: req.challenge, userId: user.id, ...(req.scope ? { scope: req.scope } : {}), expiresAt: Date.now() + CODE_TTL_MS });
      target.searchParams.set('code', code);
    }
    target.searchParams.set('state', req.state);
    return target.toString();
  }

  async exchange(dto: OauthTokenDto): Promise<OauthTokenResponse> {
    if (dto.client_id !== this.publicClientId()) throw new UnauthorizedException('invalid client_id');
    const issued = this.codes.get(dto.code ?? '');
    // Single use whatever happens next: a code presented twice is refused both times after the first.
    this.codes.delete(dto.code ?? '');
    if (!issued || issued.expiresAt < Date.now()) throw new BadRequestException('invalid_grant: the code is unknown, used or expired');
    if (issued.clientId !== dto.client_id || issued.redirectUri !== dto.redirect_uri) {
      throw new BadRequestException('invalid_grant: the code was issued to another client or redirect_uri');
    }
    const challenge = createHash('sha256').update(dto.code_verifier ?? '', 'ascii').digest('base64url');
    if (challenge !== issued.challenge) throw new BadRequestException('invalid_grant: code_verifier does not match the code_challenge');
    return this.issue(issued.userId, issued.clientId, issued.scope);
  }

  async refresh(dto: OauthTokenDto): Promise<OauthTokenResponse> {
    const held = this.refreshTokens.get(dto.refresh_token ?? '');
    this.refreshTokens.delete(dto.refresh_token ?? '');
    if (!held || held.clientId !== dto.client_id) throw new BadRequestException('invalid_grant: the refresh token is unknown or already used');
    return this.issue(held.userId, held.clientId, held.scope);
  }

  private async issue(userId: string, clientId: string, scope?: string): Promise<OauthTokenResponse> {
    const user = await this.users.findOneOrFail({ where: { id: userId } });
    if (user.deactivatedAt) throw new UnauthorizedException('account has been deactivated');
    const refresh = randomBytes(24).toString('base64url');
    this.refreshTokens.set(refresh, { clientId, userId, ...(scope ? { scope } : {}) });
    return {
      access_token: this.tokens.signAccessTokenWithTtl(user, this.ttl()),
      token_type: 'Bearer',
      expires_in: Math.round(parseDurationMs(this.ttl()) / 1000),
      refresh_token: refresh,
      ...(scope ? { scope } : {}),
    };
  }
}
