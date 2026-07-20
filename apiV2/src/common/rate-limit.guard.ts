import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthedUser } from '../auth/guards/bearer-auth.guard';

const WINDOW_MS = 1000;
const MAX_REQUESTS = 3;

// A minimal in-memory sliding-window limiter — fine at this fixture's single-process scale.
// Keyed by (user id, product id) rather than user id alone: parallel tests each create their own
// product (the suite's per-test unique-facet isolation model), so their windows never collide
// without needing a test-only header.
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthedUser }>();
    const res = context.switchToHttp().getResponse<Response>();
    const key = `${req.user?.id ?? 'anon'}:${String(req.params.productId)}`;
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter(
      (t) => now - t < WINDOW_MS,
    );

    if (recent.length >= MAX_REQUESTS) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((recent[0] + WINDOW_MS - now) / 1000),
      );
      res.setHeader('Retry-After', String(retryAfterSeconds));
      throw new HttpException(
        'rate limit exceeded — try again shortly',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}
