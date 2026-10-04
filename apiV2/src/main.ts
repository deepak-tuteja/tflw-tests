import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { AppModule } from './app.module';
import {
  ProblemDetailsFilter,
  writeProblem,
} from './common/problem-details.filter';
import type { Request, Response } from 'express';
import { toValidationProblem } from './common/validation-problem.exception';
import { contentNegotiation } from './common/content-negotiation.middleware';

async function bootstrap() {
  // tflw M246: `rawBody` keeps the request's bytes beside the parsed body, because a signature is
  // over the bytes that arrived and a re-serialised object is not them (`signed/`).
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(cookieParser());
  // M30 (plan_v2.md Cluster A, decision 11): `threshold: 0` forces every compressible response
  // through gzip regardless of size — a real app would leave the default 1kb threshold, but this
  // is a dogfood target whose whole job is giving tflw's fetch-based client a genuine gzipped
  // response to transparently decompress, even from a tiny body like `/health`'s.
  app.use(compression({ threshold: 0 }));
  app.use(contentNegotiation);
  app.setGlobalPrefix('v1');
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => toValidationProblem(errors),
    }),
  );

  const openApiConfig = new DocumentBuilder()
    .setTitle('testFlow-tests API v2')
    .setDescription(
      'Realistic e-commerce API — tflw dogfood/acceptance target for gap discovery.',
    )
    .setVersion('2.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'openapi.json',
  });

  // NestJS 12's Express adapter registers its not-found handler under the global prefix only, so a
  // path outside `/v1` (`/health`, `/nope`) fell through to Express's own HTML "Cannot GET" page.
  // Every error here is problem+json — the contract the corpus asserts — so the routes are mounted
  // first (`init`) and this answers whatever none of them matched, with the same body Nest 11 gave.
  await app.init();
  app.use((req: Request, res: Response) =>
    writeProblem(res, 404, `Cannot ${req.method} ${req.path}`),
  );

  const port = process.env.PORT ?? 4001;
  await app.listen(port);
  console.log(
    `api v2 listening on :${port} (prefix /v1, docs /docs, spec /openapi.json)`,
  );
}
void bootstrap();
