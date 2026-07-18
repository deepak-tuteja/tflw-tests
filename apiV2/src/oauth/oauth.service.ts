import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { TokensService } from '../auth/tokens.service';
import { parseDurationMs } from '../auth/ms';
import { OauthTokenDto } from './dto/oauth-token.dto';

export interface OauthTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope?: string;
}

interface OauthClient {
  id: string;
  secret: string;
  ttl: string;
}

// Client-credentials grant (PLAN_ENTERPRISE.md decision 11): two configured clients so tflw's
// `oauth2` session sugar (testFlow PLAN.md decision 99c) can dogfood both plain reuse (a normal
// TTL) and proactive re-fetch ahead of a real 401 (a ~5s TTL) against a real endpoint, not a
// fixture server. No dedicated OAuth-client table: a client-credentials grant here represents
// "the admin service account", so it signs a normal access token for the seeded admin user —
// anything that token can authorize (admin-only routes included) is authorized identically to a
// real admin bearer login. Error responses stay in this app's own RFC7807 house style
// (ProblemDetailsFilter) rather than RFC 6749's `{error: "invalid_client"}` shape — tflw's oauth2
// runtime only checks for a non-2xx status and an `access_token` field either way.
@Injectable()
export class OauthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly tokens: TokensService,
    private readonly config: ConfigService,
  ) {}

  private clients(): OauthClient[] {
    return [
      {
        id: this.config.get<string>('OAUTH_CLIENT_ID', 'tflw-oauth-client'),
        secret: this.config.get<string>('OAUTH_CLIENT_SECRET', 'tflw-oauth-secret'),
        ttl: this.config.get<string>('OAUTH_ACCESS_TTL', '1h'),
      },
      {
        id: this.config.get<string>('OAUTH_SHORT_CLIENT_ID', 'tflw-oauth-short-client'),
        secret: this.config.get<string>('OAUTH_SHORT_CLIENT_SECRET', 'tflw-oauth-short-secret'),
        ttl: this.config.get<string>('OAUTH_SHORT_ACCESS_TTL', '5s'),
      },
    ];
  }

  async token(dto: OauthTokenDto): Promise<OauthTokenResponse> {
    const client = this.clients().find((c) => c.id === dto.client_id);
    if (!client || client.secret !== dto.client_secret) {
      throw new UnauthorizedException('invalid client_id or client_secret');
    }

    const adminEmail = this.config.get<string>('ADMIN_EMAIL', 'admin@example.com');
    const admin = await this.users.findOneOrFail({ where: { email: adminEmail } });

    return {
      access_token: this.tokens.signAccessTokenWithTtl(admin, client.ttl),
      token_type: 'Bearer',
      expires_in: Math.round(parseDurationMs(client.ttl) / 1000),
      ...(dto.scope ? { scope: dto.scope } : {}),
    };
  }
}
