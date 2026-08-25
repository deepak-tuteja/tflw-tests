import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SoftCheckAnswerDto } from './dto/soft-check-answer.dto';
import { SOFT_CHECK_ANSWER } from './soft-check.constants';

// `M154b` / `C1` — the known-answer plant for tflw's `check` step (testFlow
// PLAN_M154_DOGFOOD_CONFORMANCE.md, `D722`/`D725`). `check` is the soft twin of `expect`: it
// records a failure and keeps going. The dogfood used it 9 times against `expect`'s 1692, so a
// first-class language decision (`SPEC` §6.4, `P#16`) rested on nine lines of evidence.
//
// **What makes this a plant rather than an endpoint.** The payload below is a frozen constant, and
// `tests/.constructs/soft-check-known-answer.tflw` asserts six things about it of which exactly two
// are deliberately false. That count is the known answer, and it is what lets a grader distinguish
// three outcomes a summary line cannot:
//
//   - `check` behaving as specified  ->  six rows, two failed, and the `expect` after them ran
//   - `check` failing fast like `expect`  ->  the run stops at the first false row; rows 3-6 and
//     the trailing `expect` are simply absent from the report
//   - `check` recording nothing  ->  six rows, zero failed, and a test that passes when it must not
//
// Only the first is green. The second is the regression `check` exists to not be, and note that
// under a presence-only coverage bar it is *invisible*: the file still contains the keyword, the
// suite still runs, and the summary still says the test failed. That is `D722` in one endpoint.
//
// Deliberately unauthenticated and static, for the same reason `contract-demo` is: the value here
// is the frozen shape, not any behaviour worth guarding. Deliberately NOT `/health`, which
// `tests/.demo-fail/soft-check-mixed.tflw` uses today — a two-field payload cannot express "some
// checks pass, some fail, and execution continued past both kinds", and pinning a known answer to
// an endpoint that exists to report liveness would make an operational change look like a tflw
// regression.
@ApiTags('soft-check')
@Controller('soft-check')
export class SoftCheckController {
  @Get('known-answer')
  @ApiOkResponse({ type: SoftCheckAnswerDto })
  knownAnswer(): SoftCheckAnswerDto {
    return SOFT_CHECK_ANSWER;
  }
}
