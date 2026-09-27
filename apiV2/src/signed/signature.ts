import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// tflw M246's receiving end: two verifiers, written here from the providers' published rules and
// NOT from tflw's signer. A verifier that shared the signer's code would agree with it about every
// mistake they share, which is the one thing a dogfood target is for catching.

export type Verdict = { ok: true } | { ok: false; reason: string };

/** Stripe's scheme: `Stripe-Signature: t=<unix>,v1=<hex hmac-sha256 of "<t>.<raw body>">`, with a
 *  tolerance on `t` so a captured request cannot be replayed later. */
export function verifyStripeShaped(
  header: string | undefined,
  rawBody: Buffer,
  secret: string,
  nowSeconds: number,
  toleranceSeconds = 300,
): Verdict {
  if (!header) return { ok: false, reason: 'missing Stripe-Signature header' };
  const fields = new Map<string, string[]>();
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const k = part.slice(0, eq).trim();
    fields.set(k, [...(fields.get(k) ?? []), part.slice(eq + 1).trim()]);
  }
  const t = Number(fields.get('t')?.[0]);
  const candidates = fields.get('v1') ?? [];
  if (!Number.isInteger(t) || candidates.length === 0)
    return { ok: false, reason: 'malformed Stripe-Signature header' };
  if (Math.abs(nowSeconds - t) > toleranceSeconds)
    return {
      ok: false,
      reason: `timestamp outside the ${toleranceSeconds}s tolerance`,
    };
  const expected = createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${t}.`), rawBody]))
    .digest();
  const match = candidates.some((c) => {
    const got = Buffer.from(c, 'hex');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
  return match
    ? { ok: true }
    : { ok: false, reason: 'signature does not match the payload' };
}

const AWS_UNRESERVED = /[A-Za-z0-9\-._~]/;

function awsEncode(text: string): string {
  return Array.from(Buffer.from(text, 'utf8'))
    .map((b) =>
      AWS_UNRESERVED.test(String.fromCharCode(b))
        ? String.fromCharCode(b)
        : `%${b.toString(16).toUpperCase().padStart(2, '0')}`,
    )
    .join('');
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return text;
  }
}

export interface Sigv4Request {
  readonly method: string;
  /** Path and query exactly as received, e.g. `/v1/signed/orders?b=2&a=1`. */
  readonly originalUrl: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly rawBody: Buffer;
}

/** AWS Signature Version 4, verified the way API Gateway does: rebuild the canonical request from
 *  what arrived, re-derive the key for the scope the client named, and compare. `service` and
 *  `region` are what this endpoint IS — a client scoping its signature to anything else is wrong. */
export function verifySigv4(
  req: Sigv4Request,
  credentials: Readonly<Record<string, string>>,
  expected: { region: string; service: string },
  now: Date,
): Verdict {
  const header = (name: string): string | undefined => {
    const v = req.headers[name.toLowerCase()];
    return Array.isArray(v) ? v.join(',') : v;
  };
  const auth = header('authorization');
  if (!auth) return { ok: false, reason: 'missing Authorization header' };
  const m =
    /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/([^/]+)\/aws4_request, ?SignedHeaders=([a-z0-9;-]+), ?Signature=([0-9a-f]{64})$/.exec(
      auth,
    );
  if (!m) return { ok: false, reason: 'malformed Authorization header' };
  const [, keyId, day, region, service, signedHeaders, signature] =
    m as unknown as string[];
  const secret = credentials[keyId];
  if (!secret) return { ok: false, reason: 'unknown access key' };
  if (region !== expected.region || service !== expected.service)
    return {
      ok: false,
      reason: `credential scope names ${region}/${service}, not ${expected.region}/${expected.service}`,
    };
  const amzDate = header('x-amz-date');
  if (
    !amzDate ||
    !/^\d{8}T\d{6}Z$/.test(amzDate) ||
    amzDate.slice(0, 8) !== day
  )
    return { ok: false, reason: 'missing or inconsistent X-Amz-Date' };
  const when = Date.UTC(
    +amzDate.slice(0, 4),
    +amzDate.slice(4, 6) - 1,
    +amzDate.slice(6, 8),
    +amzDate.slice(9, 11),
    +amzDate.slice(11, 13),
    +amzDate.slice(13, 15),
  );
  if (Math.abs(now.getTime() - when) > 15 * 60_000)
    return {
      ok: false,
      reason: 'request time is more than 15 minutes from the server time',
    };
  const names = signedHeaders.split(';');
  if (!names.includes('host') || !names.includes('x-amz-date'))
    return { ok: false, reason: 'host and x-amz-date must be signed' };
  const q = req.originalUrl.indexOf('?');
  const path = q === -1 ? req.originalUrl : req.originalUrl.slice(0, q);
  const query = q === -1 ? '' : req.originalUrl.slice(q + 1);
  const canonicalPath = path
    .split('/')
    .map((seg) => awsEncode(seg))
    .join('/');
  const canonicalQuery = query
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf('=');
      return [
        awsEncode(safeDecode(i === -1 ? pair : pair.slice(0, i))),
        awsEncode(safeDecode(i === -1 ? '' : pair.slice(i + 1))),
      ];
    })
    .sort(([ak, av], [bk, bv]) =>
      ak === bk ? (av < bv ? -1 : av > bv ? 1 : 0) : ak < bk ? -1 : 1,
    )
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const canonicalHeaders = names
    .map((n) => `${n}:${(header(n) ?? '').trim().replace(/\s+/g, ' ')}\n`)
    .join('');
  const payloadHash = createHash('sha256').update(req.rawBody).digest('hex');
  const canonicalRequest = [
    req.method.toUpperCase(),
    canonicalPath,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');
  let key: Buffer = createHmac('sha256', `AWS4${secret}`).update(day).digest();
  for (const part of [region, service, 'aws4_request'])
    key = createHmac('sha256', key).update(part).digest();
  const expectedSig = createHmac('sha256', key).update(stringToSign).digest();
  const got = Buffer.from(signature, 'hex');
  return got.length === expectedSig.length && timingSafeEqual(got, expectedSig)
    ? { ok: true }
    : { ok: false, reason: 'signature does not match the request' };
}
