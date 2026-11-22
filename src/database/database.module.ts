import {
  Global,
  Inject,
  Logger,
  Module,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { driverErrorCode } from '../common/problem';
import { ApiEnv } from '../config/env';
import * as schema from './schema';
import { DB, PG_POOL } from './tokens';

function createPool(config: ConfigService<ApiEnv, true>): Pool {
  const pool = new Pool({
    connectionString: config.get('DATABASE_URL', { infer: true }),
    max: config.get('DB_POOL_MAX', { infer: true }),
    statement_timeout: config.get('DB_STATEMENT_TIMEOUT_MS', { infer: true }),
  });
  // Without a listener, pg crashes the process when an idle connection drops,
  // as when postgres restarts under compose. The code alone is logged: the
  // driver's message may name the host.
  const logger = new Logger('Database');
  pool.on('error', (error) =>
    logger.warn(
      { code: driverErrorCode(error) },
      'Idle database connection failed',
    ),
  );
  return pool;
}

// The one pool of the app, and Drizzle over it. Migrations never run here:
// that is the migrate step's job (design §13).
@Global()
@Module({
  providers: [
    { provide: PG_POOL, inject: [ConfigService], useFactory: createPool },
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
