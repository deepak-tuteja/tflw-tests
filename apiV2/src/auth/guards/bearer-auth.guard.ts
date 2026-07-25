import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { TokensService } from '../tokens.service';
import { AuthService } from '../auth.service';
import { UserRole } from '../../entities/user.entity';

export interface AuthedUser {
  id: string;
  role: UserRole;
}

@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokensService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing bearer token');
    }
    const decoded = await this.tokens.verify(
      header.slice('Bearer '.length),
      'access',
    );
    // Access tokens are stateless — this is the only thing that can reject one before its own
    // TTL expiry once the user's account has been deactivated (PLAN_LIFECYCLE.md L2).
    await this.auth.assertActive(decoded.sub);
    (req as Request & { user: AuthedUser }).user = {
      id: decoded.sub,
      role: decoded.role! as UserRole,
    };
    return true;
  }
}
