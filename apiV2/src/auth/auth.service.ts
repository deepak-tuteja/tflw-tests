import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Response } from 'express';
import { User, UserRole } from '../entities/user.entity';
import { TokensService } from './tokens.service';
import { TokenRecordsService } from './token-records.service';
import { parseDurationMs } from './ms';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

export interface BearerTokenPair {
  accessToken: string;
  refreshToken: string;
}

const SESSION_COOKIE = 'session';
const SESSION_REFRESH_COOKIE = 'session_refresh';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly tokenRecords: TokenRecordsService,
    private readonly tokens: TokensService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<BearerTokenPair> {
    const existing = await this.users.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('email already registered');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.users.save(
      this.users.create({
        name: dto.name,
        email: dto.email,
        passwordHash,
        role: UserRole.USER,
      }),
    );
    return this.issueBearerPair(user);
  }

  // Public: also used by AnyAuthGuard's HTTP Basic branch (M6, plan_v2.md Part D decision 9) —
  // the same credential check as bearer/session login, just reached via a different transport.
  async validateCredentials(email: string, password: string): Promise<User> {
    const user = await this.users.findOne({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('invalid email or password');
    }
    return user;
  }

  async login(dto: LoginDto): Promise<BearerTokenPair> {
    const user = await this.validateCredentials(dto.email, dto.password);
    return this.issueBearerPair(user);
  }

  private async issueBearerPair(user: User): Promise<BearerTokenPair> {
    const ttl = this.config.get<string>('JWT_REFRESH_TTL', '1h');
    const row = await this.tokenRecords.issue(user.id, parseDurationMs(ttl));
    return {
      accessToken: this.tokens.signAccessToken(user),
      refreshToken: this.tokens.signRefreshToken(user, row.id),
    };
  }

  async refresh(refreshToken: string): Promise<BearerTokenPair> {
    const decoded = await this.tokens.verify(refreshToken, 'refresh');
    await this.tokenRecords.assertLive(decoded.jti!);
    await this.tokenRecords.revoke(decoded.jti!);

    const user = await this.users.findOneOrFail({ where: { id: decoded.sub } });
    return this.issueBearerPair(user);
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const decoded = await this.tokens.verify(refreshToken, 'refresh');
      await this.tokenRecords.revoke(decoded.jti!);
    } catch {
      // Idempotent: an already-expired/invalid/reused refresh token has nothing left to revoke.
    }
  }

  async profile(userId: string): Promise<Pick<User, 'id' | 'name' | 'email' | 'role'>> {
    const user = await this.users.findOneOrFail({ where: { id: userId } });
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  private setCookie(
    res: Response,
    name: string,
    value: string,
    ttl: string,
    sameSite: 'lax' | 'strict',
  ) {
    res.cookie(name, value, {
      httpOnly: true,
      sameSite,
      maxAge: parseDurationMs(ttl),
      path: '/',
    });
  }

  private async issueSessionCookie(user: User, res: Response): Promise<string> {
    const ttl = this.config.get<string>('JWT_SESSION_TTL', '1h');
    const row = await this.tokenRecords.issue(user.id, parseDurationMs(ttl));
    const csrfToken = this.tokens.newCsrfToken();
    this.setCookie(
      res,
      SESSION_COOKIE,
      this.tokens.signSessionToken(user, csrfToken, row.id),
      ttl,
      'lax',
    );
    return csrfToken;
  }

  async sessionLogin(
    dto: LoginDto,
    res: Response,
    opts: { withRefreshCookie: boolean },
  ): Promise<{ userId: string; csrfToken: string }> {
    const user = await this.validateCredentials(dto.email, dto.password);
    const csrfToken = await this.issueSessionCookie(user, res);

    if (opts.withRefreshCookie) {
      const ttl = this.config.get<string>('JWT_SESSION_REFRESH_TTL', '2h');
      const row = await this.tokenRecords.issue(user.id, parseDurationMs(ttl));
      this.setCookie(
        res,
        SESSION_REFRESH_COOKIE,
        this.tokens.signSessionRefreshToken(user, row.id),
        ttl,
        'strict',
      );
    }

    return { userId: user.id, csrfToken };
  }

  async sessionRefresh(
    sessionRefreshCookie: string | undefined,
    res: Response,
  ): Promise<{ csrfToken: string }> {
    if (!sessionRefreshCookie) {
      throw new UnauthorizedException('missing session_refresh cookie');
    }
    const decoded = await this.tokens.verify(sessionRefreshCookie, 'session_refresh');
    await this.tokenRecords.assertLive(decoded.jti!);

    const user = await this.users.findOneOrFail({ where: { id: decoded.sub } });
    const csrfToken = await this.issueSessionCookie(user, res);
    return { csrfToken };
  }

  async sessionLogout(
    sessionCookie: string | undefined,
    sessionRefreshCookie: string | undefined,
    res: Response,
  ): Promise<void> {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.clearCookie(SESSION_REFRESH_COOKIE, { path: '/' });

    for (const [cookie, typ] of [
      [sessionCookie, 'session'],
      [sessionRefreshCookie, 'session_refresh'],
    ] as const) {
      if (!cookie) continue;
      try {
        const decoded = await this.tokens.verify(cookie, typ);
        await this.tokenRecords.revoke(decoded.jti!);
      } catch {
        // Idempotent, same as bearer logout.
      }
    }
  }
}
