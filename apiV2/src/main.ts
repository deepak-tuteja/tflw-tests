import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './common/problem-details.filter';
import { toValidationProblem } from './common/validation-problem.exception';
import { contentNegotiation } from './common/content-negotiation.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  const port = process.env.PORT ?? 4001;
  await app.listen(port);
  console.log(
    `api v2 listening on :${port} (prefix /v1, docs /docs, spec /openapi.json)`,
  );
}
void bootstrap();
