import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';

// `S-3d` transport (decision 18): two ways a response carries nothing — a 204, which by definition
// has no body, and a 200 whose body is empty — so a journey can tell "no content" from "nothing".
@ApiExcludeController()
@Controller('edge')
export class EmptyController {
  @Get('no-content')
  @HttpCode(204)
  noContent(): void {}

  @Get('empty-ok')
  emptyOk(@Res() res: Response): void {
    res.status(200).setHeader('Content-Length', '0');
    res.end();
  }
}
