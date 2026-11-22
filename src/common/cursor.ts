import isPlainObject from 'lodash/isPlainObject';
import { validate } from 'uuid';
import { EARLIEST_INSTANT, LATEST_INSTANT } from './limits';

const EARLIEST = Temporal.Instant.from(EARLIEST_INSTANT);
const LATEST = Temporal.Instant.from(LATEST_INSTANT);

// The keyset cursor of design §9.2: opaque to clients, base64url of
// {"v":1,"at":"<ISO with milliseconds>","id":"<uuid>"}, built from the stored
// row (performed_at to the millisecond, and id).

export function encodeCursor(c: { at: Date; id: string }): string {
  const json = JSON.stringify({ v: 1, at: c.at.toISOString(), id: c.id });
  return Buffer.from(json, 'utf8').toString('base64url');
}

// Domain logic: null, which the caller answers with a 400, unless the text
// decodes to a JSON object of exactly v: 1, an `at` that Temporal.Instant.from
// reads, between EARLIEST_INSTANT and LATEST_INSTANT (as every stored row is;
// past year 9999 PostgreSQL would refuse the bound), and an `id` that is a
// UUID. It is lenient about spelling (padded or standard base64, other JSON
// layouts, other instant forms, upper-case ids) and never throws, whatever
// text it is given.
export function decodeCursor(raw: string): { at: Date; id: string } | null {
  if (typeof raw !== 'string') return null;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!isPlainObject(value)) return null;
  const { v, at, id, ...rest } = value as Record<string, unknown>;
  if (v !== 1 || Object.keys(rest).length > 0) return null;
  if (typeof at !== 'string' || typeof id !== 'string' || !validate(id)) {
    return null;
  }
  let instant: Temporal.Instant;
  try {
    instant = Temporal.Instant.from(at);
  } catch {
    return null;
  }
  if (
    Temporal.Instant.compare(instant, EARLIEST) < 0 ||
    Temporal.Instant.compare(instant, LATEST) > 0
  ) {
    return null;
  }
  return { at: new Date(instant.epochMilliseconds), id };
}
