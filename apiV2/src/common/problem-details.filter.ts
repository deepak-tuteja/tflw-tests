import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ValidationProblemException } from './validation-problem.exception';

const STATUS_TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  409: 'Conflict',
  412: 'Precondition Failed',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

// RFC7807 (application/problem+json) everywhere — every error response, from a 401 to an
// uncaught 500, has the same {type,title,status,detail,errors?} shape so scenarios can assert
// against one contract instead of learning a bespoke error format per endpoint.
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProblemDetailsFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const detail =
      exception instanceof ValidationProblemException
        ? exception.message
        : exception instanceof HttpException
          ? extractDetail(exception)
          : 'an unexpected error occurred';

    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    res.status(status).type('application/problem+json').json({
      type: 'about:blank',
      title: STATUS_TITLES[status] ?? 'Error',
      status,
      detail,
      ...(exception instanceof ValidationProblemException ? { errors: exception.errors } : {}),
    });
  }
}

function extractDetail(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  if (typeof response === 'object' && response !== null && 'message' in response) {
    const { message } = response as { message: string | string[] };
    return Array.isArray(message) ? message.join(', ') : message;
  }
  return exception.message;
}
