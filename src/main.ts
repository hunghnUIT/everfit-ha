import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_OPTIONS, configureApp } from './app.setup';
import { ApiEnv } from './config/env';
import { driverErrorCode, errorName } from './common/problem';
import { describeDatabaseUrl } from './database/describe-url';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    APP_OPTIONS,
  );
  configureApp(app);
  // On SIGTERM, Nest runs onModuleDestroy: the database pool is drained.
  app.enableShutdownHooks();
  const config = app.get<ConfigService<ApiEnv, true>>(ConfigService);
  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  // The database as host:port/name only: the URL carries the password.
  new Logger('Bootstrap').log(
    {
      port,
      database: describeDatabaseUrl(
        config.get('DATABASE_URL', { infer: true }),
      ),
    },
    'Listening',
  );
}
// A failed start (for example the catalog's boot deadline, design §10.2)
// ends as one log line and exit code 1; compose restarts the api. The error's
// message and stack stay out: a driver's message can name the database host.
bootstrap().catch((error: unknown) => {
  new Logger('Bootstrap').fatal(
    { code: driverErrorCode(error), errorName: errorName(error) },
    'The api could not start',
  );
  Logger.flush();
  process.exitCode = 1;
});
