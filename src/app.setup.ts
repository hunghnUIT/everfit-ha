import { NestApplicationOptions, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { BODY_LIMIT } from './common/limits';
import { validationProblem } from './common/problem';
import { ProblemDetailsFilter } from './common/problem-details.filter';
import { toFieldErrors } from './common/validation';

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
  app.setGlobalPrefix('v1', {
    exclude: ['health/live', 'health/ready', 'docs', 'docs-json'],
  });
  // Before the body parser, so a request it refuses still gets the headers.
  // Compose serves plain HTTP, so the Swagger UI must not be upgraded to HTTPS.
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
    }),
  );
  // express.json, the only body parser (Nest's adapter calls express.json
  // with these options).
  app.useBodyParser('json', { limit: BODY_LIMIT, type: 'application/json' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: true,
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
