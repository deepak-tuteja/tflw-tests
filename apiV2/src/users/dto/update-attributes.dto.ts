// Deliberately not a class-validator-decorated class: this is an RFC 7386 JSON Merge Patch
// body, so the whole point is arbitrary top-level keys — decorators can't express "any key is
// allowed", and the global ValidationPipe's whitelist/forbidNonWhitelisted only apply to
// metatypes that aren't the bare `Object` constructor (see Nest's ValidationPipe.toValidate),
// so typing the body as this plain type skips that pipe entirely and the raw JSON reaches the
// service. UsersService validates "is it a plain object" itself before treating it as a patch.
export type UpdateAttributesDto = Record<string, unknown>;
