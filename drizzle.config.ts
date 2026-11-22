import { defineConfig } from 'drizzle-kit';

// Used only for `drizzle-kit generate --custom --name=<name>`, which creates an
// empty migration file and its journal entry. The SQL is written by hand: never
// generate a migration from schema.ts, and never `push` (design §13).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './src/database/migrations',
});
