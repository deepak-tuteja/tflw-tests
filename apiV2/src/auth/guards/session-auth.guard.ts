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
import { AuthedUser } from './bearer-auth.guard';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokensService,
    private readonly tokenRecords: TokenRecordsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const cookie = req.cookies?.session as string | undefined;
    if (!cookie) {
      throw new UnauthorizedException('missing session cookie');
    }
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
      role: decoded.role!,
    };
    return true;
  }
}
