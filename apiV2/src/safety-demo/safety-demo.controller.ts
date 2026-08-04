import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';

// Off-host redirect showcase for tflw's `allow hosts` guardrail (SPEC §3.7; tflw M85, review
// cluster C1 / `B4-02`) — the *negative* case, exercised by
// `tests/.demo-fail/allow-hosts-blocked.tflw` under `--env allowHostsBlocked`.
//
// Why a redirect rather than simply pointing the env at an unlisted base URL, which is what this
// fixture used to do: as of tflw M85 an env whose own base URL its own allowlist cannot match is a
// `tflw check` error (`TF036`), so a config written that way never reaches the runtime and the
// fixture would prove the checker instead of the guardrail. A redirect keeps the config internally
// consistent — the base URL *is* on the list — while still handing the run to a host that isn't.
// It is also the truer shape of the risk the guardrail exists for: the dangerous host is normally
// one the server chooses, not one anybody typed.
//
// The target is a real, reachable address (this same server, spelled `127.0.0.1` rather than
// `localhost`, so it is a different *host* to an allowlist while needing no second process). The
// point of the fixture is that a request which *would* have succeeded is refused before any
// connection — a target nothing is listening on would prove only that the hop failed.
//
// Excluded from the OpenAPI doc: a test-affordance, not a forward-facing surface — same reasoning
// as `CatalogRedirectController`.
@ApiExcludeController()
@Controller('safety-demo')
export class SafetyDemoController {
  @Get('offsite-redirect')
  redirectOffsite(@Res() res: Response) {
    const port = process.env.PORT ?? '4001';
    res.redirect(302, `http://127.0.0.1:${port}/v1/health`);
  }
}
