import pino from 'pino';
import { driverErrorCode } from '../common/problem';
import { ConfigError, validateMigrateEnv } from '../config/env';
import { describeDatabaseUrl } from '../database/describe-url';
import { runMigrateStep } from '../database/migrator';

// `node dist/cli/migrate.js`: the one-shot step compose runs before api. A
// plain entry point outside Nest, reading only the variables it uses (§13).
export async function main(): Promise<void> {
  const logger = pino({ name: 'migrate' });
  try {
    const env = validateMigrateEnv(process.env);
    logger.level = env.LOG_LEVEL;
    const database = describeDatabaseUrl(env.DATABASE_URL);
    logger.info({ database }, 'Migrate step started');
    await runMigrateStep(env);
    logger.info({ database }, 'Migrate step finished');
  } catch (error) {
    // One line. A ConfigError names the variables and never their values; any
    // other error gives its code only, since a driver's message may carry the
    // host or the URL.
    if (error instanceof ConfigError) {
      logger.fatal(error.message);
    } else {
      logger.fatal({ code: driverErrorCode(error) }, 'Migrate step failed');
    }
    process.exitCode = 1;
  }
}

if (require.main === module) void main();
