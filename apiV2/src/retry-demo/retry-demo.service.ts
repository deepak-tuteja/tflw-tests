import { Injectable } from '@nestjs/common';

export interface RetryDemoResult {
  status: 429 | 200;
  retryAfterValue?: string;
  body: Record<string, unknown>;
}

// Purpose-built dogfood fixture for tflw's `retry honoring "Retry-After" up to N` (PLAN
// decision 102b, enterprise arc cluster 3, closes TFLW-GAPS.md gap #5) — a clean 2-state machine
// (unlike flaky-widget's 3-state 503→429→201, whose first response carries no Retry-After header
// at all and so doesn't exercise this clause cleanly). In-memory per-key attempt counter, same
// "pure test scaffolding, no persistence" pattern flaky-widget already uses — tests use `random
// string 8` for fresh keys.
@Injectable()
export class RetryDemoService {
  private readonly attempts = new Map<string, number>();

  attempt(key: string, format: 'seconds' | 'date' = 'seconds'): RetryDemoResult {
    const n = (this.attempts.get(key) ?? 0) + 1;
    this.attempts.set(key, n);

    if (n === 1) {
      const retryAfterValue = format === 'date' ? new Date(Date.now() + 1000).toUTCString() : '1';
      return { status: 429, retryAfterValue, body: { key, attempt: n, detail: 'rate limited, honor Retry-After' } };
    }
    return { status: 200, body: { key, attempt: n, detail: 'ok' } };
  }
}
