import { Injectable } from '@nestjs/common';
import { LIFECYCLE_SUCCEEDS_ON } from './lifecycle.constants';

export interface AttemptResult {
  status: 503 | 200;
  body: Record<string, unknown>;
}

// In-memory, process-lifetime counters. Two maps rather than one because they answer two different
// questions and a grader that could confuse them would be a grader with a silent failure mode:
// `attempts` counts requests that asked to settle, `marks` counts hook arrivals.
@Injectable()
export class LifecycleService {
  private readonly attempts = new Map<string, number>();
  private readonly marks = new Map<string, number>();

  /** Fail until this key's configured attempt, then succeed. An unconfigured key never succeeds —
   *  deliberately, so a plant that typos its key gets a red rather than an accidental pass. */
  attempt(key: string): AttemptResult {
    const n = (this.attempts.get(key) ?? 0) + 1;
    this.attempts.set(key, n);
    const succeedsOn: number | undefined = LIFECYCLE_SUCCEEDS_ON[key];
    if (succeedsOn === undefined || n < succeedsOn) {
      return { status: 503, body: { key, attempt: n, settled: false } };
    }
    return { status: 200, body: { key, attempt: n, settled: true } };
  }

  /** A bare counter, for the steps and hooks whose only job is to prove they executed. */
  mark(label: string): number {
    const n = (this.marks.get(label) ?? 0) + 1;
    this.marks.set(label, n);
    return n;
  }

  counts(): {
    attempts: Record<string, number>;
    marks: Record<string, number>;
  } {
    return {
      attempts: Object.fromEntries(this.attempts),
      marks: Object.fromEntries(this.marks),
    };
  }

  /** Total reset, called from each plant's `before file`. Scoped to nothing — the two plants use
   *  disjoint keys and labels, so a shared reset is safe and a per-key reset would just be more
   *  surface for a plant to get wrong. */
  reset(): void {
    this.attempts.clear();
    this.marks.clear();
  }
}
