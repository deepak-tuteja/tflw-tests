import type { NextFunction, Request, Response } from 'express';

const METHODS_WITH_BODY = new Set(['POST', 'PATCH', 'PUT']);

// Global content-negotiation gate (406/415), applied before routing so every endpoint gets the
// same behavior without repeating it per-controller. Kept deliberately narrow: this API only ever
// produces/consumes JSON, so anything else is rejected up front rather than left to whatever a
// given handler happens to do with an unexpected Accept/Content-Type.
export function contentNegotiation(req: Request, res: Response, next: NextFunction): void {
  const accept = req.headers['accept'];
  if (
    typeof accept === 'string' &&
    accept !== '*/*' &&
    !accept.includes('application/json') &&
    !accept.includes('application/problem+json') &&
    !accept.includes('*/*')
  ) {
    res.status(406).type('application/problem+json').json({
      type: 'about:blank',
      title: 'Not Acceptable',
      status: 406,
      detail: `cannot produce a representation matching Accept: ${accept}`,
    });
    return;
  }

  const hasBody = METHODS_WITH_BODY.has(req.method) && Number(req.headers['content-length'] ?? 0) > 0;
  if (hasBody) {
    const contentType = req.headers['content-type'];
    if (typeof contentType !== 'string' || !contentType.includes('application/json')) {
      res.status(415).type('application/problem+json').json({
        type: 'about:blank',
        title: 'Unsupported Media Type',
        status: 415,
        detail: `expected Content-Type: application/json, got ${contentType ?? '(none)'}`,
      });
      return;
    }
  }

  next();
}
