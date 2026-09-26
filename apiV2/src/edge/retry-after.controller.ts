import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';

// `S-3d` transport (decision 18): 503 with `Retry-After`, in both of the header's forms — delta
// seconds and an HTTP-date — then 200 once the named key has been refused `times` times. Keyed so
// concurrent journeys never share a refusal count.
const refusals = new Map<string, number>();

@ApiExcludeController()
@Controller('edge/unavailable')
export class RetryAfterController {
  @Get()
  unavailable(
    @Query('key') key = 'default',
    @Query('form') form = 'seconds',
    @Query('times') times = '1',
    @Res({ passthrough: true }) res: Response,
  ): { ok: true; refusedBefore: number } | { detail: string } {
    const seen = refusals.get(key) ?? 0;
    if (seen < (Number(times) || 1)) {
      refusals.set(key, seen + 1);
      res.status(503);
      res.setHeader(
        'Retry-After',
        form === 'date' ? new Date(Date.now() + 1000).toUTCString() : '1',
      );
      return { detail: 'briefly unavailable — retry after the header says' };
    }
    return { ok: true, refusedBefore: seen };
  }
}
