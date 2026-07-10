import { Body, Controller, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { FlakyWidgetService } from './flaky-widget.service';
import { FlakyWidgetDto } from './dto/flaky-widget.dto';

// Retry/backoff showcase: fails twice by key (503, then 429+Retry-After), succeeds on the third
// attempt — unauthenticated, since flakiness here is a transport concern, not an authz one.
@ApiTags('flaky-widget')
@Controller('flaky-widget')
export class FlakyWidgetController {
  constructor(private readonly widget: FlakyWidgetService) {}

  @Post()
  handle(@Body() dto: FlakyWidgetDto, @Res({ passthrough: true }) res: Response) {
    const result = this.widget.attempt(dto.key);
    if (result.retryAfterSeconds !== undefined) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
    }
    res.status(result.status);
    return result.body;
  }
}
