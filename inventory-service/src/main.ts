import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import {
  ProblemDetailsFilter,
  writeProblem,
} from "./common/problem-details.filter";
import type { Request, Response } from "express";
import { toValidationProblem } from "./common/validation-problem.exception";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("v1");
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
    .setTitle("inventory-service")
    .setDescription(
      "PLAN_ENTERPRISE_REGRESSION.md E4 — warehouses/stock/backorders, own DB, called by apiV2 at checkout.",
    )
    .setVersion("1.0")
    .build();
  const document = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup("docs", app, document, {
    jsonDocumentUrl: "openapi.json",
  });

  // NestJS 12's Express adapter registers its not-found handler under the global prefix only, so a
  // path outside `/v1` fell through to Express's own HTML "Cannot GET" page. Every error here is
  // problem+json — the contract apiV2 and the corpus read — so the routes are mounted first (`init`)
  // and this answers whatever none of them matched, with the same body Nest 11 gave.
  await app.init();
  app.use((req: Request, res: Response) =>
    writeProblem(res, 404, `Cannot ${req.method} ${req.path}`),
  );

  const port = process.env.PORT ?? 4002;
  await app.listen(port);
  console.log(
    `inventory-service listening on :${port} (prefix /v1, docs /docs, spec /openapi.json)`,
  );
}
void bootstrap();
