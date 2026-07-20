import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UserRole } from '../../entities/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthedUser } from './bearer-auth.guard';

// Runs after BearerAuthGuard/SessionAuthGuard/AnyAuthGuard, which populate req.user.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user: AuthedUser }>();
    if (!required.includes(req.user.role)) {
      throw new ForbiddenException(`requires role: ${required.join(' or ')}`);
    }
    return true;
  }
}
