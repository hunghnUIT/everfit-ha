import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { runMigrateStep } from '../../src/database/migrator';

// The global setup and teardown run in the same process, so the container is
// handed to the teardown through globalThis.
export type ContainerHolder = typeof globalThis & {
  postgresContainer?: StartedPostgreSqlContainer;
};

// One PostgreSQL for the whole integration run. Its session zone differs from
// both UTC and the process zone (design §12), so a value that passes through
// the wrong zone comes out wrong.
export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:18-alpine')
    .withCommand(['postgres', '-c', 'timezone=America/Los_Angeles'])
    .start();
  // Stored first, so the teardown stops the container even if a migration fails.
  (globalThis as ContainerHolder).postgresContainer = container;
  process.env.DATABASE_URL = container.getConnectionUri();
  // The real migrate step, so every test runs on the hand-written schema.
  await runMigrateStep({
    DATABASE_URL: process.env.DATABASE_URL,
    LOG_LEVEL: 'fatal',
  });
  // Keeps request lines and the logged 500s out of the test output.
  process.env.LOG_LEVEL = 'fatal';
}
