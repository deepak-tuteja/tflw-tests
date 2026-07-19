import { Body, Controller, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RetryDemoService } from './retry-demo.service';
import { RetryDemoDto } from './dto/retry-demo.dto';

// Rate-limited-then-succeeds showcase for tflw's `retry honoring "Retry-After" up to N` (PLAN
// decision 102b) — unauthenticated, since the retry mechanics here are a transport concern, not
// an authz one, same as flaky-widget.
@ApiTags('retry-demo')
@Controller('retry-demo')
export class RetryDemoController {
  constructor(private readonly demo: RetryDemoService) {}

  @Post()
  handle(@Body() dto: RetryDemoDto, @Res({ passthrough: true }) res: Response) {
    const result = this.demo.attempt(dto.key, dto.format);
    if (result.retryAfterValue !== undefined) {
      res.setHeader('Retry-After', result.retryAfterValue);
    }
    res.status(result.status);
    return result.body;
  }
}
