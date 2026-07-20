import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { TokensService } from '../tokens.service';
import { TokenRecordsService } from '../token-records.service';
import { AuthService } from '../auth.service';
import { AuthedUser } from './bearer-auth.guard';
import { UserRole } from '../../entities/user.entity';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Accepts any of three transports — most storefront-style resources (orders, reviews) are
// reachable from a bearer-authed admin tool, a cookie-authed shopper session, or (M6, plan_v2.md
// Part D decision 9) a classic HTTP Basic client, all alike.
@Injectable()
export class AnyAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokensService,
    private readonly tokenRecords: TokenRecordsService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    const cookie = req.cookies?.session as string | undefined;

    if (header?.startsWith('Bearer ')) {
      const decoded = await this.tokens.verify(
        header.slice('Bearer '.length),
        'access',
      );
      (req as Request & { user: AuthedUser }).user = {
        id: decoded.sub,
        role: decoded.role! as UserRole,
      };
      return true;
    }

    if (header?.startsWith('Basic ')) {
      const [email, password] = Buffer.from(
        header.slice('Basic '.length),
        'base64',
      )
        .toString('utf8')
        .split(':');
      const user = await this.auth.validateCredentials(
        email ?? '',
        password ?? '',
      );
      (req as Request & { user: AuthedUser }).user = {
        id: user.id,
        role: user.role,
      };
      return true;
    }

    if (cookie) {
      const decoded = await this.tokens.verify(cookie, 'session');
      await this.tokenRecords.assertLive(decoded.jti!);
      if (MUTATING_METHODS.has(req.method)) {
        const csrfHeader = req.headers['x-csrf-token'];
        if (!csrfHeader || csrfHeader !== decoded.csrf) {
          throw new ForbiddenException('missing or invalid CSRF token');
        }
      }
      (req as Request & { user: AuthedUser }).user = {
        id: decoded.sub,
        role: decoded.role! as UserRole,
      };
      return true;
    }

    throw new UnauthorizedException(
      'missing bearer token, session cookie, or Basic credentials',
    );
  }
}
