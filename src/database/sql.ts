import { SQL, sql } from 'drizzle-orm';

const ARRAY_CASTS = { text: sql`text[]`, uuid: sql`uuid[]` } as const;

// The whole array as one bound parameter with its cast, for `= ANY(…)`. A
// JavaScript array put straight into a Drizzle `sql` template becomes a list
// of parameters, `($1, $2, …)`.
export function pgArray(values: readonly string[], type: 'text' | 'uuid'): SQL {
  return sql`${sql.param([...values])}::${ARRAY_CASTS[type]}`;
}

// A timestamptz read through db.execute(sql…) arrives as PostgreSQL's text,
// such as '2025-02-10 01:00:00.123-08' (Drizzle's driver turns off pg's own
// parser). Temporal reads it; it carries its offset, so the instant is exact.
export function toDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  return new Date(Temporal.Instant.from(value).epochMilliseconds);
}
