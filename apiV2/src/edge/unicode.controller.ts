import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';

// `S-3d` data (decision 18): names outside ASCII — combining marks, a non-Latin script, emoji — in a
// body, echoed back from a request body, and in a header. An HTTP header value is Latin-1 on the
// wire, so `X-Greeting` carries a Latin-1 name and `X-Name-Encoded` the emoji name percent-encoded,
// which is how a real server has to send one.
const NAME = 'Zoë Łukasiewicz 🚀';

@ApiExcludeController()
@Controller('edge/unicode')
export class UnicodeController {
  @Get()
  unicode(@Res({ passthrough: true }) res: Response): Record<string, string> {
    res.setHeader('X-Greeting', 'Grüße');
    res.setHeader('X-Name-Encoded', encodeURIComponent(NAME));
    return { name: NAME, city: 'Łódź', japanese: '東京', emoji: '🚀✨' };
  }

  @Post('echo')
  @HttpCode(200)
  echo(@Body() body: Record<string, unknown>): Record<string, unknown> {
    return {
      echoed: body,
      nameLength: typeof body.name === 'string' ? [...body.name].length : null,
    };
  }
}
