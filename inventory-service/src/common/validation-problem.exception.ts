import { UnprocessableEntityException, ValidationError } from "@nestjs/common";

export interface FieldError {
  field: string;
  message: string;
}

// Same convention as apiV2's own validation-problem.exception.ts — thrown by main.ts's
// ValidationPipe exceptionFactory instead of the default 400, so a validation failure here is
// exactly as consistent with the rest of this suite as every apiV2 endpoint already is.
export class ValidationProblemException extends UnprocessableEntityException {
  constructor(public readonly errors: FieldError[]) {
    super("validation failed");
  }
}

function flatten(errors: ValidationError[], parentPath = ""): FieldError[] {
  const out: FieldError[] = [];
  for (const err of errors) {
    const field = parentPath ? `${parentPath}.${err.property}` : err.property;
    if (err.constraints) {
      for (const message of Object.values(err.constraints)) {
        out.push({ field, message });
      }
    }
    if (err.children?.length) {
      out.push(...flatten(err.children, field));
    }
  }
  return out;
}

export function toValidationProblem(
  errors: ValidationError[],
): ValidationProblemException {
  return new ValidationProblemException(flatten(errors));
}
