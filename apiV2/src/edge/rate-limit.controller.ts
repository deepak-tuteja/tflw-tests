import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';

// `S-3d` transport (decision 18): three requests per key per window, each answered with the
// `X-RateLimit-*` headers a client reads, and the fourth refused with 429 and `Retry-After`. Keyed so
// journeys do not share a window; `?reset=1` empties a key.
const LIMIT = 3;
const WINDOW_S = 60;
const used = new Map<string, number>();

@ApiExcludeController()
@Controller('edge/limited')
export class RateLimitController {
  @Get()
  limited(
    @Query('key') key = 'default',
    @Query('reset') reset: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): { used: number } | { detail: string } {
    if (reset) used.delete(key);
    const count = (used.get(key) ?? 0) + 1;
    used.set(key, count);
    res.setHeader('X-RateLimit-Limit', String(LIMIT));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(LIMIT - count, 0)));
    res.setHeader('X-RateLimit-Reset', String(WINDOW_S));
    if (count > LIMIT) {
      res.status(429);
      res.setHeader('Retry-After', String(WINDOW_S));
      return { detail: `at most ${LIMIT} requests a window` };
    }
    return { used: count };
  }
}
