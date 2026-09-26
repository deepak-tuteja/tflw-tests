import { Controller, Get, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

// `S-3d` transport (decision 18): a route that answers late on request, capped at 15 s — the
// surface a step's `timeout` is written against, both the case that fits and the case that does not.
@ApiExcludeController()
@Controller('edge/slow')
export class SlowController {
  @Get()
  async slow(
    @Query('ms') ms: string | undefined,
  ): Promise<{ sleptMs: number }> {
    const sleptMs = Math.min(Math.max(Number(ms ?? 0) || 0, 0), 15_000);
    await new Promise((resolve) => setTimeout(resolve, sleptMs));
    return { sleptMs };
  }
}
