import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { TokensService } from '../tokens.service';
import { UserRole } from '../../entities/user.entity';

export interface AuthedUser {
  id: string;
  role: UserRole;
}

@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokensService) {}

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
    (req as Request & { user: AuthedUser }).user = {
      id: decoded.sub,
      role: decoded.role! as UserRole,
    };
    return true;
  }
}
