import {
  All,
  BadRequestException,
  Controller,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';

// `S-3d` transport (decision 18): each of the four redirect statuses, to one landing route that
// says which method arrived. 301/302 let a client turn a POST into a GET; 307/308 must not — which
// is the difference a journey can see through `landed.method`.
const CODES = new Set([301, 302, 307, 308]);

@ApiExcludeController()
@Controller('edge')
export class RedirectController {
  @All('redirect/:code')
  redirect(@Param('code') code: string, @Res() res: Response): void {
    const status = Number(code);
    if (!CODES.has(status))
      throw new BadRequestException(
        'a redirect status is 301, 302, 307 or 308',
      );
    res.redirect(status, `/v1/edge/landed?from=${status}`);
  }

  @All('landed')
  landed(@Req() req: Request): { method: string; from: string | null } {
    return {
      method: req.method,
      from: typeof req.query.from === 'string' ? req.query.from : null,
    };
  }
}
