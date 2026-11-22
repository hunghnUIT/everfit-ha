import { INestApplication, Type } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { APP_OPTIONS, configureApp } from '../../src/app.setup';

export type TestOverrides = {
  providers?: { provide: unknown; useValue: unknown }[];
  controllers?: Type[];
};

const apps: INestApplication[] = [];

// Builds the app the way main.ts does: AppModule, APP_OPTIONS, configureApp.
export async function createTestApp(
  overrides: TestOverrides = {},
): Promise<INestApplication> {
  const builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: overrides.controllers ?? [],
  });
  for (const { provide, useValue } of overrides.providers ?? []) {
    builder.overrideProvider(provide).useValue(useValue);
  }
  const moduleRef = await builder.compile();
  const app =
    moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS);
  // Recorded before init, so an app whose init fails is still closed.
  apps.push(app);
  configureApp(app);
  await app.init();
  return app;
}

export async function closeTestApps(): Promise<void> {
  await Promise.all(apps.splice(0).map((app) => app.close()));
}
