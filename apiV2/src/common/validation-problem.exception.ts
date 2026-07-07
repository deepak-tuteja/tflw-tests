import { UnprocessableEntityException, ValidationError } from '@nestjs/common';

export interface FieldError {
  field: string;
  message: string;
}

// Thrown by main.ts's ValidationPipe exceptionFactory instead of the default 400 — carries
// per-field detail so ProblemDetailsFilter can render RFC7807's `errors` array.
export class ValidationProblemException extends UnprocessableEntityException {
  constructor(public readonly errors: FieldError[]) {
    super('validation failed');
  }
}

function flatten(errors: ValidationError[], parentPath = ''): FieldError[] {
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

export function toValidationProblem(errors: ValidationError[]): ValidationProblemException {
  return new ValidationProblemException(flatten(errors));
}
