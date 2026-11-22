import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_OPTIONS, configureApp } from './app.setup';
import { ApiEnv } from './config/env';
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
void bootstrap();
