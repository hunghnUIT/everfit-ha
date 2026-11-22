import { INestApplication, NestApplicationOptions } from '@nestjs/common';

// Nest's own parsers stay off: their 100 kb JSON limit and their form parser
// would run before any parser configureApp adds.
export const APP_OPTIONS: NestApplicationOptions = { bodyParser: false };

// Every global setting lives here, so main.ts and the tests build the same app.
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('v1', {
    exclude: ['health/live', 'health/ready', 'docs', 'docs-json'],
  });
}
