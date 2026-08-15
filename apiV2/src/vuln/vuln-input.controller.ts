import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Order } from '../entities/order.entity';
import { VulnNoteDto } from './dto/vuln-note.dto';

// The input-handling fixture slice for tflw's pentest arc Tier 3 (testFlow
// PLAN_M134_PENTEST_TIER3.md, D379/D395–D401). `VULNS.md` rows `V10`–`V14`;
// `scripts/verify-security-target.mjs` is what keeps this file and that ledger from drifting apart.
//
// WHY A THIRD CONTROLLER RATHER THAN A THIRD SECTION OF AN EXISTING ONE. `vuln.module.ts` already
// splits its two controllers along what each one *needs*: Tier 1's hygiene routes have no
// dependencies at all, Tier 2's authorization routes need a guard and real rows. Tier 3 needs a
// third thing again — a raw query, a filesystem read and a markup response — and folding it into
// either neighbour would hand that neighbour dependencies it has no use for. `M128a`'s slice ran
// with no imports and should keep running that way.
//
// WHY THESE ROUTES EXIST, WHICH IS D379'S MEASUREMENT AND NOT AN ASSUMPTION. Tier 3 mutates the
// inputs of a request the suite already made, so it needs inputs. Pointed at the fixture slice as
// it stood before this file, the whole planted corpus offered **one** mutable field: there is no
// `@Query()` anywhere in `vuln/`, every `:id` sits behind `ParseUUIDPipe` — which rejects type
// confusion and traversal with a `400` before any application code runs — and the single body leaf
// that exists arrived in `M132b` for an unrelated reason. A tier pointed at that grades a wall of
// `400`s and reports clean. This is D363's trap one tier later, caught at scoping.
//
// EVERY ROUTE IS SPECIFIED AGAINST ITS RULE'S *DETECTOR*, NOT ITS RULE'S NAME (D395). Each of the
// four rules ships with a narrowing that exists to hold Tier 1's zero-false-positive bar, and three
// of the four plants would have reported nothing if written to the invariant's name alone. The
// per-route comments below say which narrowing each one answers, because that is the part a later
// reader will otherwise "simplify" away.
//
// Excluded from the OpenAPI document, and absent entirely without `VULN_MODE=1` — see
// `vuln.module.ts` for both.
@ApiExcludeController()
@Controller('vuln')
export class VulnInputController {
  // `V11`'s intended directory: a scratch dir with one file in it, created at construction rather
  // than shipped in the image. Nothing about the plant needs a checked-in fixture, and a directory
  // under `tmpdir()` is deep enough that the traversal payload's four `../` hops land at the root
  // in the container (`/tmp/tflw-vuln-items` → `/`), which is what makes `/etc/passwd` reachable
  // and therefore what makes the positive demonstrable.
  private readonly itemsDir = join(tmpdir(), 'tflw-vuln-items');

  constructor(
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
  ) {
    mkdirSync(this.itemsDir, { recursive: true });
    // Named `7` because `isIdentifierSegment` recognises a run of digits, a UUID or a long hex
    // string and **nothing else** (D395). A slug like `note-one` is not a mutation site at all, so
    // the corpus would reach `TF067` — "this request has nothing to mutate" — and the traversal
    // invariant would be lost to a checker complaint about the test rather than a finding about
    // the app.
    writeFileSync(join(this.itemsDir, '7'), 'the seventh item\n');
  }

  // POSITIVE — `sec/reflected-input-unescaped` (moderate), at `query \`q\``.
  //
  // **The content type is the plant.** `reflectedInputUnescaped` requires an HTML or `text/*` body
  // and explicitly declines a JSON echo, because echoing `<tflw>` inside a JSON string is correct
  // behaviour — JSON has no markup semantics and the browser that renders it is where the escaping
  // belongs. A handler here that returned an object would serve `application/json`, the rule would
  // stand down, and this route would be a fixture that proves nothing.
  //
  // So: `text/html`, and the query value interpolated raw. The payload that fires is
  // `injection/html-metacharacters` (`<tflw>`) and only that one — the rule also requires the
  // payload to carry `<` or `>`, so `{{7*7}}` reaches this route, comes back verbatim, and is
  // correctly not a reflection finding.
  //
  // The global content-negotiation gate does not interfere: it reads the *request's* `Accept` and
  // says nothing about what a handler produces.
  @Get('lookup')
  lookup(@Query('q') q: string | undefined, @Res() res: Response) {
    res
      .type('text/html')
      .send(
        `<!doctype html><title>lookup</title><p>no results for: ${q ?? ''}`,
      );
  }

  // NEGATIVE — `sec/reflected-input-unescaped` (moderate), and the only route in either corpus that
  // can make that rule go **quiet** rather than not-applicable.
  //
  // **Why a second reflection route rather than reusing an existing negative.** A rule that never
  // engaged has not been shown to stay quiet — the `V2`/`V5` precedent from Tier 1. Every other
  // endpoint in this repo answers `application/json`, and `reflectedInputUnescaped` declines a JSON
  // echo by design, so pointing the rule at any of them yields *not applicable*: the third state,
  // already demonstrated, and not this one. The rule only becomes applicable against a `text/html`
  // body, so the silent state needs a route that serves markup **and escapes**. There was none.
  //
  // Deliberately the same shape as `lookup` above, differing in exactly one thing — the escape — so
  // that the pair is a controlled comparison. `<tflw>` comes back as `&lt;tflw&gt;`, the payload is
  // sent and answered, and the rule finds nothing. That is a measured silence.
  //
  // `&` is replaced first, or the ampersands introduced by the later replacements would be
  // double-escaped.
  @Get('lookup-escaped')
  lookupEscaped(@Query('q') q: string | undefined, @Res() res: Response) {
    const escaped = (q ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    res
      .type('text/html')
      .send(
        `<!doctype html><title>lookup</title><p>no results for: ${escaped}`,
      );
  }

  // POSITIVE — `sec/path-traversal-read` (critical), at the identifier path segment.
  //
  // **No `ParseUUIDPipe`, and the file's contents are returned.** Both halves are the plant.
  // `pathTraversalRead` matches a *filesystem signature* — a `root:…:0:0:` line, a private-key
  // header, a Windows ini section — and never a path echo, precisely so that an application which
  // reflects the attempted path back in an error message cannot be scored as having read anything.
  // A route that 404'd with the path in the message would therefore produce nothing.
  //
  // Only `traversal/relative` escapes: `join()` resolves its four `../` hops to `/etc/passwd`. The
  // percent-encoded and `....//` variants arrive as literal filenames because this handler does no
  // `../` stripping and no second decode, and the absolute variant joins *under* the base. That is
  // the honest answer — those payloads exist to catch an app with a broken filter, and this app has
  // no filter at all — and the ledger records one firing payload rather than claiming the class.
  //
  // The failure path answers a bare `404` with nothing of the attempt in it, so this route
  // contributes to exactly one rule.
  @Get('items/:id')
  item(@Param('id') id: string, @Res() res: Response) {
    let contents: string;
    try {
      contents = readFileSync(join(this.itemsDir, id), 'utf8');
    } catch {
      throw new NotFoundException('no such item');
    }
    res.type('text/plain').send(contents);
  }

  // POSITIVE — `sec/error-detail-disclosure` (serious) at `body \`text\``, and
  // `sec/oversized-input-accepted` (minor) at `body \`title\`` (and at `text`, see below).
  //
  // ONE ROUTE, TWO LEAVES, TWO RULES. That is deliberate: it gives the tier a single observed
  // request offering two independently-attributable mutation sites, which is the shape D376's
  // per-site fingerprint exists for. The oversized payload is accepted at *both* leaves, so one
  // permissive DTO yields two findings with two fingerprints — correct rather than duplicated,
  // because two unbounded fields are two repairs.
  //
  // **The `catch` is the disclosure plant, and it has to be** (D396). `ProblemDetailsFilter` is
  // global and unconditional: anything that is not an `HttpException` becomes
  // `{"detail":"an unexpected error occurred"}` with the stack sent to the logger and never to the
  // body. So "run a concatenated query and let it throw" — the cheap version of this plant —
  // produces a scrubbed 500 that matches no detector. What a real handler does instead, and what
  // this one does, is catch the driver error and serialize it.
  //
  // **The evidence is the ORM class name, not a Postgres wording.** `tflw'` produces *unterminated
  // quoted string at or near…*, which is not the `syntax error at or near` literal tflw's SQL
  // detector carries; keying the plant on the database's phrasing would pass today and break on an
  // upgrade. `QueryFailedError` is in the ORM-exception-name detector and is stable.
  //
  // Only `injection/sql-quote` fires. A double quote and a trailing semicolon are *valid* inside a
  // single-quoted SQL literal and produce no error at all, and the five type-confusion payloads are
  // refused by the `ValidationPipe` with a clean `400` — all of which the ledger records rather
  // than rounding up to "the injection class fires here".
  //
  // The query touches no table on purpose. The flaw being demonstrated is the concatenation, and a
  // fixture that read real rows would put a raw query next to real data for no added coverage.
  @Post('notes')
  async note(
    @Body() dto: VulnNoteDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const rows: Array<{ echo: string }> = await this.orders.query(
        `SELECT '${dto.text}'::text AS echo`,
      );
      // `title` is stored nowhere and bounded by nothing — the whole of `V13`. Echoing its length
      // rather than its contents keeps this route's *success* body free of anything a detector
      // could read, so the oversized rule is judged on the status it was written to judge.
      return { echo: rows[0]?.echo ?? '', titleLength: dto.title.length };
    } catch (err) {
      const e = err as Error;
      res.status(500);
      return { error: e.name, detail: e.message };
    }
  }
}
