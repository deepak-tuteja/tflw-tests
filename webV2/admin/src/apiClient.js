const API_BASE_URL = process.env.API_BASE_URL ?? 'http://api:4001/v1';

export class ApiError extends Error {
  constructor(status, problem) {
    super(problem?.detail ?? `apiV2 request failed with ${status}`);
    this.status = status;
    this.problem = problem;
  }
}

// Parses just the `session=...` pair out of a Set-Cookie header — this server never needs the
// cookie's other attributes (Path/HttpOnly/SameSite), only the value, since it replays it as a
// plain `Cookie` header on later server-to-server calls (there is no browser involved on this
// leg — the browser only ever talks to this Express app, never directly to apiV2).
export function extractSessionCookie(setCookieHeaders) {
  for (const header of setCookieHeaders ?? []) {
    const match = /^session=([^;]+)/.exec(header);
    if (match) return match[1];
  }
  return null;
}

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

// `auth` is the subset of the admin's express-session this app stores after login:
// { sessionCookie, csrfToken }. Every call forwards them server-side so apiV2 sees the same
// authenticated identity the admin logged into this console with (a BFF pattern — apiV2's
// double-submit CSRF cookie/token pairing was designed for a browser talking to it directly,
// which never happens here).
export async function apiRequest(auth, method, path, body) {
  const headers = { Accept: 'application/json' };
  if (auth?.sessionCookie) headers.Cookie = `session=${auth.sessionCookie}`;
  if (auth?.csrfToken && MUTATING.has(method)) headers['X-CSRF-Token'] = auth.csrfToken;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const setCookie = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    throw new ApiError(res.status, data);
  }
  return { data, setCookie };
}
