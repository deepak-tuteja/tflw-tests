// Thin fetch wrapper for apiV2 (see apiV2/src/auth/guards/session-auth.guard.ts).
//
// Auth is the `session` httpOnly cookie (sent automatically, same-origin, via
// `credentials: 'include'`) plus a double-submit CSRF token: `POST /auth/session-login` returns
// `{ csrfToken }` in its body (the cookie alone never carries it), and every mutating request
// (POST/PATCH/DELETE) must echo it back as `X-CSRF-Token` or the API 403s. `setCsrfToken` is
// called from AuthContext right after login/hydration; everything else here just reads it.
const CSRF_STORAGE_KEY = 'webv2.csrfToken';

let csrfToken: string | null = sessionStorage.getItem(CSRF_STORAGE_KEY);

export function setCsrfToken(token: string | null) {
  csrfToken = token;
  if (token) sessionStorage.setItem(CSRF_STORAGE_KEY, token);
  else sessionStorage.removeItem(CSRF_STORAGE_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (MUTATING.has(method) && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  const res = await fetch(`/v1${path}`, {
    method,
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get('content-type')?.includes('json');
  const payload = isJson ? await res.json() : undefined;

  if (!res.ok) {
    const detail = (payload as { detail?: string } | undefined)?.detail ?? res.statusText;
    throw new ApiError(res.status, detail);
  }

  return payload as T;
}
