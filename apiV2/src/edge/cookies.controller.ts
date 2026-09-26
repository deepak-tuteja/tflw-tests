import { Controller, Get, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';

// `S-3d` session (decision 18): cookies with every attribute a server sets — `HttpOnly`,
// `SameSite=Strict`, `Secure`, a `Domain`, and one that deletes itself (`Max-Age=0`) — and an echo
// of what came back. A test client's jar is not a browser's: tflw replays what it was told to keep
// and enforces none of `Secure`/`HttpOnly`/`SameSite` (SPEC's cookie-jar section), so the echo is
// the known answer for which attributes a jar honours and which it deliberately ignores.
@ApiExcludeController()
@Controller('edge/cookies')
export class CookiesController {
  @Get()
  set(@Res({ passthrough: true }) res: Response): { set: string[] } {
    const lines = [
      'edge_plain=1; Path=/',
      'edge_httponly=2; Path=/; HttpOnly; SameSite=Strict',
      'edge_secure=3; Path=/; Secure; SameSite=None',
      'edge_domain=4; Path=/; Domain=localhost',
      'edge_gone=5; Path=/; Max-Age=0',
    ];
    res.setHeader('Set-Cookie', lines);
    return { set: lines.map((l) => l.split('=')[0]) };
  }

  @Get('echo')
  echo(@Req() req: Request): { cookie: string } {
    return { cookie: req.headers.cookie ?? '' };
  }
}
