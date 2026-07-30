import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { ProblemDetailsFilter } from "./common/problem-details.filter";
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

  const port = process.env.PORT ?? 4002;
  await app.listen(port);
  console.log(
    `inventory-service listening on :${port} (prefix /v1, docs /docs, spec /openapi.json)`,
  );
}
void bootstrap();
