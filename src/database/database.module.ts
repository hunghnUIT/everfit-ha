import {
  Global,
  Inject,
  Logger,
  Module,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PinoLogger } from 'nestjs-pino';
import { Pool } from 'pg';
import { driverErrorCode, errorName } from '../common/problem';
import { ApiEnv } from '../config/env';
import * as schema from './schema';
import { DB, PG_POOL } from './tokens';

function createPool(
  config: ConfigService<ApiEnv, true>,
  pinoLogger: PinoLogger,
): Pool {
  const pool = new Pool({
    connectionString: config.get('DATABASE_URL', { infer: true }),
    max: config.get('DB_POOL_MAX', { infer: true }),
    statement_timeout: config.get('DB_STATEMENT_TIMEOUT_MS', { infer: true }),
  });
  const logger = new Logger('Database');
  // One line per failed connection, idle or in use, written by each client's
  // own listener: pg-pool removes its listener from a client it hands out, so
  // without this a connection lost mid-query (a restart,
  // pg_terminate_backend) would be an unhandled 'error' event that ends the
  // process. The line says nothing of the state, which it does not know. It
  // is written outside any request's logging context (runInContext starts
  // from the root logger): a connection does not belong to the request that
  // happened to open it. The code and name alone: the driver's message may
  // name the host.
  pool.on('connect', (client) =>
    client.on('error', (error) =>
      pinoLogger.runInContext(() =>
        logger.warn(
          { code: driverErrorCode(error), name: errorName(error) },
          'Database connection failed',
        ),
      ),
    ),
  );
  // pg-pool re-emits an idle client's error on the pool, and with no listener
  // that is an unhandled 'error' that ends the process. The client's listener
  // above has already logged it, so this one is silent.
  pool.on('error', () => {});
  return pool;
}

// The one pool of the app, and Drizzle over it. Migrations never run here:
// that is the migrate step's job (design §13).
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService, PinoLogger],
      useFactory: createPool,
    },
    {
      provide: DB,
      inject: [PG_POOL],
      useFactory: (pool: Pool) => drizzle(pool, { schema }),
    },
  ],
  exports: [PG_POOL, DB],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  // Drains the pool on shutdown (enableShutdownHooks in main.ts).
  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
