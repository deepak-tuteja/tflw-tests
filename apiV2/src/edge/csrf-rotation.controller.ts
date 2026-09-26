import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { randomBytes } from 'node:crypto';

// `S-3d` session (decision 18): a CSRF token that rotates on every response. `GET` issues one; each
// accepted `POST` spends it and issues the next in `X-CSRF-Token`, so a client that replays a stale
// token — the commonest mistake a test makes against such a server — is refused with 403. Keyed so
// journeys never share a token.
const current = new Map<string, string>();

function issue(key: string, res: Response): string {
  const token = randomBytes(12).toString('hex');
  current.set(key, token);
  res.setHeader('X-CSRF-Token', token);
  return token;
}

@ApiExcludeController()
@Controller('edge/csrf')
export class CsrfRotationController {
  @Get()
  start(
    @Query('key') key = 'default',
    @Res({ passthrough: true }) res: Response,
  ): { csrfToken: string } {
    return { csrfToken: issue(key, res) };
  }

  @Post('act')
  @HttpCode(200)
  act(
    @Query('key') key = 'default',
    @Headers('x-csrf-token') sent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): { accepted: true; next: string } {
    if (!sent || sent !== current.get(key))
      throw new ForbiddenException('a CSRF token is good for one request');
    return { accepted: true, next: issue(key, res) };
  }
}
