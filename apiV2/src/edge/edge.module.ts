import { Module } from '@nestjs/common';
import { CookiesController } from './cookies.controller';
import { CsrfRotationController } from './csrf-rotation.controller';
import { EmptyController } from './empty.controller';
import { EncodingController } from './encoding.controller';
import { ExpiringSessionController } from './expiring-session.controller';
import { LargeController } from './large.controller';
import { NullsController } from './nulls.controller';
import { PaginationController } from './pagination.controller';
import { RateLimitController } from './rate-limit.controller';
import { RedirectController } from './redirect.controller';
import { RetryAfterController } from './retry-after.controller';
import { SlowController } from './slow.controller';
import { UnicodeController } from './unicode.controller';
import { ViaController } from './via.controller';

// `S-3d` (tflw-tests `PLAN_M239_DOGFOOD_EXPANSION.md`, decision 18): the edge module — one controller
// per case a user of tflw lands in against a real server, each with a journey under
// `tests/api/edge/`. Everything here is under `/v1/edge/` and owns its own state (keyed per journey),
// so no case can disturb the storefront's data or another journey's.
//
// Every controller here is left out of the OpenAPI document (`@ApiExcludeController`, as `vuln/` is):
// these are transport fixtures graded by their own journeys, and published they became subjects of
// the security scan's authorization crawl — twelve honest declines (non-JSON bodies, a 429, `@All`'s
// SEARCH) against a gate that pins the app's blind spots, not the fixtures'.
@Module({
  controllers: [
    SlowController,
    RetryAfterController,
    RedirectController,
    EmptyController,
    EncodingController,
    RateLimitController,
    NullsController,
    UnicodeController,
    LargeController,
    PaginationController,
    ExpiringSessionController,
    CsrfRotationController,
    CookiesController,
    ViaController,
  ],
})
export class EdgeModule {}
