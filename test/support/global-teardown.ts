import type { ContainerHolder } from './global-setup';

export default async function globalTeardown(): Promise<void> {
  await (globalThis as ContainerHolder).postgresContainer?.stop();
}
