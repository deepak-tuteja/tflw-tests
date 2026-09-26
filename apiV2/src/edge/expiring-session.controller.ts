import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

// `S-3d` session (decision 18): a session that expires in the middle of a test. The token carries its
// own expiry (a signed-in-name-only token: this is a timing surface, not an auth one), so a journey
// can see 200, wait past the lifetime it asked for, and see 401 — the shape of a real short-TTL
// access token going stale between two steps.
interface EdgeToken {
  who: string;
  exp: number;
}

@ApiExcludeController()
@Controller('edge/session')
export class ExpiringSessionController {
  @Post()
  @HttpCode(200)
  open(@Body() body: { who?: string; ttlMs?: number }): {
    token: string;
    expiresInMs: number;
  } {
    const ttl = Math.min(
      Math.max(Number(body?.ttlMs ?? 1500) || 1500, 200),
      60_000,
    );
    const token: EdgeToken = {
      who: body?.who ?? 'edge',
      exp: Date.now() + ttl,
    };
    return {
      token: Buffer.from(JSON.stringify(token)).toString('base64url'),
      expiresInMs: ttl,
    };
  }

  @Get('whoami')
  whoami(@Headers('authorization') authorization: string | undefined): {
    who: string;
    remainingMs: number;
  } {
    const raw = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : '';
    let token: EdgeToken;
    try {
      token = JSON.parse(
        Buffer.from(raw, 'base64url').toString('utf8'),
      ) as EdgeToken;
    } catch {
      throw new UnauthorizedException('no edge session');
    }
    const remainingMs = token.exp - Date.now();
    if (!(remainingMs > 0))
      throw new UnauthorizedException('the edge session expired');
    return { who: token.who, remainingMs };
  }
}
