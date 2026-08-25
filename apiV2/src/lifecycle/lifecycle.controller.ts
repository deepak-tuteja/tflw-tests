import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { LifecycleService } from './lifecycle.service';
import { LifecycleAttemptDto, LifecycleMarkDto } from './dto/lifecycle.dto';

// `M154c` / `C4`, `C5` — the run-lifecycle plants (testFlow `PLAN_M154_DOGFOOD_CONFORMANCE.md`,
// `D722`/`D725`). See `lifecycle.constants.ts` for what each counter is the known answer to.
//
// Unauthenticated and unconditionally mounted (`D725`): these are counters, not flaws. Nothing here
// touches the database, so a plant run cannot perturb any other test's fixtures.
@ApiTags('lifecycle')
@Controller('lifecycle')
export class LifecycleController {
  constructor(private readonly lifecycle: LifecycleService) {}

  /** 503 until this key's configured attempt, then 200. Drives `C4`'s retry budget. */
  @Post('attempt')
  attempt(
    @Body() dto: LifecycleAttemptDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = this.lifecycle.attempt(dto.key);
    res.status(result.status);
    return result.body;
  }

  /** Records that a step or hook executed. 200 always — a mark must never be the reason a plant
   *  goes red, or the counter and the verdict stop being independent observations. */
  @Post('mark')
  @HttpCode(200)
  mark(@Body() dto: LifecycleMarkDto) {
    return { label: dto.label, count: this.lifecycle.mark(dto.label) };
  }

  /** The grader's read-back. Every count in one payload, so the precision half can assert the
   *  *complement* — that nothing was marked or attempted beyond what the plant declares. */
  @Get('counts')
  counts() {
    return this.lifecycle.counts();
  }

  @Post('reset')
  @HttpCode(200)
  reset() {
    this.lifecycle.reset();
    return { reset: true };
  }
}
