import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

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
  process.env.DATABASE_URL = container.getConnectionUri();
  (globalThis as ContainerHolder).postgresContainer = container;
}
