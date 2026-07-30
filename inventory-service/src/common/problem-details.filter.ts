import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response } from "express";
import { ValidationProblemException } from "./validation-problem.exception";

const STATUS_TITLES: Record<number, string> = {
  400: "Bad Request",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Entity",
  500: "Internal Server Error",
};

// Same RFC7807 (application/problem+json) shape as apiV2's own ProblemDetailsFilter — kept
// consistent since apiV2 is itself a caller of this service (ReservationsController's response),
// not just this service's own direct-hit test callers.
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger("ProblemDetailsFilter");

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const detail =
      exception instanceof ValidationProblemException
        ? exception.message
        : exception instanceof HttpException
          ? extractDetail(exception)
          : "an unexpected error occurred";

    if (status >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.stack : exception,
      );
    }

    res
      .status(status)
      .type("application/problem+json")
      .json({
        type: "about:blank",
        title: STATUS_TITLES[status] ?? "Error",
        status,
        detail,
        ...(exception instanceof ValidationProblemException
          ? { errors: exception.errors }
          : {}),
      });
  }
}

function extractDetail(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === "string") return response;
  if (
    typeof response === "object" &&
    response !== null &&
    "message" in response
  ) {
    const { message } = response as { message: string | string[] };
    return Array.isArray(message) ? message.join(", ") : message;
  }
  return exception.message;
}
