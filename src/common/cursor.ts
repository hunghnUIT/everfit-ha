import isPlainObject from 'lodash/isPlainObject';
import { validate } from 'uuid';

// The keyset cursor of design §9.2: opaque to clients, base64url of
// {"v":1,"at":"<ISO with milliseconds>","id":"<uuid>"}, built from the stored
// row (performed_at to the millisecond, and id).

export function encodeCursor(c: { at: Date; id: string }): string {
  const json = JSON.stringify({ v: 1, at: c.at.toISOString(), id: c.id });
  return Buffer.from(json, 'utf8').toString('base64url');
}

// Domain logic: null for anything this codec did not write, so the caller
// answers 400. It never throws, whatever text it is given.
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
  try {
    return { at: new Date(Temporal.Instant.from(at).epochMilliseconds), id };
  } catch {
    return null;
  }
}
