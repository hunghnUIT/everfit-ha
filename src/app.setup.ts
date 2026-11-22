import { NestApplicationOptions, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { requireJson } from './common/json-only.middleware';
import { BODY_LIMIT } from './common/limits';
import { validationProblem } from './common/problem';
import { ProblemDetailsFilter } from './common/problem-details.filter';
import { toFieldErrors, VALIDATOR_OPTIONS } from './common/validation';

// Nest's own parsers stay off: their 100 kb JSON limit and their form parser
// would run before any parser configureApp adds. Logs are buffered until the
// pino logger is in place.
export const APP_OPTIONS: NestApplicationOptions = {
  bodyParser: false,
  bufferLogs: true,
};

// Every global setting lives here, so main.ts and the tests build the same app.
export function configureApp(app: NestExpressApplication): void {
  app.useLogger(app.get(Logger));
  // No global prefix: each controller names /v1 in its own path. With a
  // global prefix Nest mounts its not-found handler under the prefix and the
  // excluded paths only, so GET / would get Express's HTML 404 instead of
  // problem details (§9.6).
  // Before the body parser, so a request it refuses still gets the headers.
  // Compose serves plain HTTP, so the Swagger UI must not be upgraded to HTTPS.
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
    }),
  );
  // A body that is not JSON is a 415 before any parser reads it (§9.6).
  app.use(requireJson);
  // express.json, the only body parser (Nest's adapter calls express.json
  // with these options).
  app.useBodyParser('json', { limit: BODY_LIMIT, type: 'application/json' });
  app.useGlobalPipes(
    new ValidationPipe({
      ...VALIDATOR_OPTIONS,
      // Nest drops each error's target by default; toFieldErrors reads it to
      // tell a query DTO from a body DTO. The target never reaches a response.
      validationError: { target: true },
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      exceptionFactory: (errors) => validationProblem(toFieldErrors(errors)),
    }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Workout Logging API')
      .setVersion('1')
      .build(),
  );
  SwaggerModule.setup('docs', app, document);
}
