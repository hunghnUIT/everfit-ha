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
// A failed start (the catalog's boot deadline, design §10.2, or a port
// already taken) writes one log line and ends the process with exit code 1 at
// once, whatever still holds the event loop (the pool, the catalog's timer);
// compose restarts the api. pino flushes its stdout stream synchronously on
// process exit, so the line is written in full. The error's message and stack
// stay out: a driver's message can name the database host.
bootstrap().catch((error: unknown) => {
  new Logger('Bootstrap').fatal(
    { code: driverErrorCode(error), errorName: errorName(error) },
    'The api could not start',
  );
  Logger.flush();
  process.exit(1);
});
