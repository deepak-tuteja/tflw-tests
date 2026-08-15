import { IsString } from 'class-validator';

// The body `V12` and `V13` are planted in (testFlow PLAN_M134_PENTEST_TIER3.md, D397).
//
// **`@IsString()` and deliberately no `@MaxLength()`** — and the presence of the first decorator is
// as load-bearing as the absence of the second. The global `ValidationPipe` runs with
// `whitelist: true, forbidNonWhitelisted: true`, so a DTO with *no* decorators is not a permissive
// DTO: every property is stripped and the handler receives `{}`. A plant written that way would
// accept nothing, mutate nothing and grade clean.
//
// So the unbounded field has to be typed and unbounded, which is also the realistic defect. Nobody
// forgets `@IsString()`; plenty of people forget the length bound, and `sec/oversized-input-accepted`
// exists for exactly that endpoint.
//
// The same pipe is what makes tflw's five type-confusion payloads (`null`, `true`, `1234567890`,
// `["tflw"]`, `{"tflw":1}`) land here as a clean `422` — measured, not assumed: `toValidationProblem`
// maps a validation failure to Unprocessable Entity — with an RFC7807 body and no disclosure. That
// is correct behaviour, and this corpus demonstrates it rather than assuming it — which is why the
// type-confusion class contributes no positive to the ledger.
//
// No `@ApiProperty*`: the whole controller is `@ApiExcludeController()`, so a schema for it would
// describe a route that is absent from the document and from the app without `VULN_MODE=1`.
export class VulnNoteDto {
  // `V12`'s field — concatenated into a raw SQL string by the handler.
  @IsString()
  text!: string;

  // `V13`'s field — stored as given, with no bound of any kind.
  @IsString()
  title!: string;
}
