import { Injectable } from '@nestjs/common';

export interface FlakyAttemptResult {
  status: 503 | 429 | 201;
  retryAfterSeconds?: number;
  body: Record<string, unknown>;
}

// In-memory per-key attempt counter — pure test scaffolding for retry/backoff scenarios, not a
// real domain resource, so no persistence (mirrors the "simulate the surface, don't build
// unnecessary infra" pattern already used for async jobs/image uploads). A key's counter never
// resets; tests use `random string 8` so each run gets fresh keys.
@Injectable()
export class FlakyWidgetService {
  private readonly attempts = new Map<string, number>();

  attempt(key: string): FlakyAttemptResult {
    const n = (this.attempts.get(key) ?? 0) + 1;
    this.attempts.set(key, n);

    if (n === 1) {
      return { status: 503, body: { key, attempt: n, detail: 'transiently unavailable, try again' } };
    }
    if (n === 2) {
      return {
        status: 429,
        retryAfterSeconds: 2,
        body: { key, attempt: n, detail: 'rate limited, honor Retry-After' },
      };
    }
    return { status: 201, body: { key, attempt: n, detail: 'created' } };
  }
}
