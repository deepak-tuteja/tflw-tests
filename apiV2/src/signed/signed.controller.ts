import { Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { verifySigv4, verifyStripeShaped, type Verdict } from './signature';

// tflw M246 (D1344–D1349): the two things a signed request is sent to. A webhook receiver that
// checks its sender's HMAC before trusting the payload, and an IAM-style route that checks an AWS
// SigV4 `Authorization`. Unauthenticated otherwise — the signature IS the credential here.

const WEBHOOK_SECRET =
  process.env.WEBHOOK_SIGNING_SECRET ?? 'whsec-dev-change-me';
const SIGV4_KEYS: Record<string, string> = {
  [process.env.SIGV4_ACCESS_KEY_ID ?? 'AKIDDOGFOOD']:
    process.env.SIGV4_SECRET_ACCESS_KEY ?? 'dogfood-sigv4-secret-change-me',
};
const SIGV4_SCOPE = { region: 'eu-west-1', service: 'execute-api' };

function refuse(
  res: Response,
  status: number,
  verdict: Verdict & { ok: false },
): Record<string, unknown> {
  res.status(status).type('application/problem+json');
  return {
    type: 'about:blank',
    title: status === 400 ? 'Bad signature' : 'Forbidden',
    status,
    detail: verdict.reason,
  };
}

function raw(req: RawBodyRequest<Request>): Buffer {
  return req.rawBody ?? Buffer.alloc(0);
}

@ApiTags('signed')
@Controller()
export class SignedController {
  /** Stripe's shape, Stripe's status: a bad or stale signature is 400, as Stripe's own docs have
   *  a receiver answer, and the reason is in `detail` so a failed test says which rule refused. */
  @Post('webhooks/stripe')
  @HttpCode(200)
  stripe(
    @Req() req: RawBodyRequest<Request>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const verdict = verifyStripeShaped(
      req.header('stripe-signature'),
      raw(req),
      WEBHOOK_SECRET,
      Math.floor(Date.now() / 1000),
    );
    if (!verdict.ok) return refuse(res, 400, verdict);
    const event = req.body as { id?: unknown; type?: unknown };
    return { received: true, id: event?.id ?? null, type: event?.type ?? null };
  }

  /** API Gateway's answer to a bad SigV4 is 403; so is this route's. */
  @Get('signed/orders')
  list(
    @Req() req: RawBodyRequest<Request>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const verdict = verifySigv4(
      {
        method: req.method,
        originalUrl: req.originalUrl,
        headers: req.headers,
        rawBody: raw(req),
      },
      SIGV4_KEYS,
      SIGV4_SCOPE,
      new Date(),
    );
    if (!verdict.ok) return refuse(res, 403, verdict);
    return { items: [{ id: 1, total: 19.98 }], signed: true };
  }

  @Post('signed/orders')
  @HttpCode(201)
  create(
    @Req() req: RawBodyRequest<Request>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const verdict = verifySigv4(
      {
        method: req.method,
        originalUrl: req.originalUrl,
        headers: req.headers,
        rawBody: raw(req),
      },
      SIGV4_KEYS,
      SIGV4_SCOPE,
      new Date(),
    );
    if (!verdict.ok) return refuse(res, 403, verdict);
    const created: unknown = req.body;
    return { created: created ?? null, signed: true };
  }
}
