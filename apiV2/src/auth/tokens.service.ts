import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { User } from '../entities/user.entity';

export type TokenType = 'access' | 'refresh' | 'session' | 'session_refresh';

export interface DecodedToken {
  sub: string;
  role?: string;
  csrf?: string;
  jti?: string;
  typ: TokenType;
}

// Four token families share two secrets (access-class: access + session; refresh-class: refresh
// + session_refresh) but each carries its own TTL and a `typ` claim, so a token issued for one
// transport can't be replayed as another even though the signature would still verify.
@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private secretFor(typ: TokenType): string {
    return typ === 'access' || typ === 'session'
      ? this.config.get<string>('JWT_ACCESS_SECRET', 'dev-access-secret-change-me')
      : this.config.get<string>('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me');
  }

  private ttlFor(typ: TokenType): string {
    switch (typ) {
      case 'access':
        return this.config.get<string>('JWT_ACCESS_TTL', '5s');
      case 'refresh':
        return this.config.get<string>('JWT_REFRESH_TTL', '1h');
      case 'session':
        return this.config.get<string>('JWT_SESSION_TTL', '1h');
      case 'session_refresh':
        return this.config.get<string>('JWT_SESSION_REFRESH_TTL', '2h');
    }
  }

  sign(payload: Omit<DecodedToken, 'csrf'> & { csrf?: string }): string {
    return this.jwt.sign(payload, {
      secret: this.secretFor(payload.typ),
      // Env-driven TTL strings ("5s"/"1h"/…) aren't literal types, so they can't satisfy
      // @nestjs/jwt's `StringValue` template-literal type at compile time even though `ms`
      // (which it wraps) parses them fine at runtime.
      expiresIn: this.ttlFor(payload.typ) as unknown as number,
    });
  }

  signAccessToken(user: User): string {
    return this.sign({ sub: user.id, role: user.role, typ: 'access' });
  }

  signRefreshToken(user: User, jti: string): string {
    return this.sign({ sub: user.id, jti, typ: 'refresh' });
  }

  signSessionToken(user: User, csrf: string, jti: string): string {
    return this.sign({ sub: user.id, role: user.role, csrf, jti, typ: 'session' });
  }

  signSessionRefreshToken(user: User, jti: string): string {
    return this.sign({ sub: user.id, jti, typ: 'session_refresh' });
  }

  newCsrfToken(): string {
    return randomBytes(24).toString('hex');
  }

  /** Verifies signature + expiry, then enforces the claimed `typ` really matches. */
  async verify(token: string, expected: TokenType): Promise<DecodedToken> {
    let decoded: DecodedToken;
    try {
      decoded = await this.jwt.verifyAsync<DecodedToken>(token, {
        secret: this.secretFor(expected),
      });
    } catch {
      throw new UnauthorizedException('invalid or expired token');
    }
    if (decoded.typ !== expected) {
      throw new UnauthorizedException(`expected a ${expected} token`);
    }
    return decoded;
  }
}
