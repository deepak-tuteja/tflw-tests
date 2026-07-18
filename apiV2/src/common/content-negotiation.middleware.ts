import type { NextFunction, Request, Response } from 'express';

const METHODS_WITH_BODY = new Set(['POST', 'PATCH', 'PUT']);

// M6 (plan_v2.md Part D decision 8): a few routes deliberately accept a non-JSON Content-Type,
// same "branch on the specific route" approach the rest of this gate already uses — everything
// else on the API stays JSON-only. `/oauth/token` (M22, enterprise arc cluster 1) joins this list
// because RFC 6749 §4.4.2's client-credentials grant is form-urlencoded by spec, same reasoning
// as `/auth/login` already accepting it.
const EXTRA_ALLOWED_CONTENT_TYPES: Record<string, string[]> = {
  'POST /v1/auth/login': ['application/x-www-form-urlencoded'],
  'POST /v1/products/:id/image': ['multipart/form-data'],
  'POST /v1/oauth/token': ['application/x-www-form-urlencoded'],
};

function extraAllowedContentTypes(method: string, path: string): string[] {
  if (method === 'POST' && path === '/v1/auth/login') {
    return EXTRA_ALLOWED_CONTENT_TYPES['POST /v1/auth/login'];
  }
  if (method === 'POST' && /^\/v1\/products\/[^/]+\/image$/.test(path)) {
    return EXTRA_ALLOWED_CONTENT_TYPES['POST /v1/products/:id/image'];
  }
  if (method === 'POST' && path === '/v1/oauth/token') {
    return EXTRA_ALLOWED_CONTENT_TYPES['POST /v1/oauth/token'];
  }
  return [];
}

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
    const extraAllowed = extraAllowedContentTypes(req.method, req.path);
    const allowed =
      typeof contentType === 'string' &&
      (contentType.includes('application/json') ||
        extraAllowed.some((allowedType) => contentType.includes(allowedType)));
    if (!allowed) {
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
