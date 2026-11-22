import attempt from 'lodash/attempt';
import isError from 'lodash/isError';
import {
  EARLIEST_INSTANT,
  FUTURE_TOLERANCE_MS,
  LATEST_INSTANT,
  MAX_UTC_OFFSET_MINUTES,
  MIN_UTC_OFFSET_MINUTES,
} from '../../common/limits';
import { Check, FieldError } from '../../common/problem';

// Design §8. One parser, Temporal.Instant.from; the hand-written patterns
// below read only what Temporal does not expose.

const EARLIEST = Temporal.Instant.from(EARLIEST_INSTANT);
const LATEST = Temporal.Instant.from(LATEST_INSTANT);
const Z_ADVICE = 'Z means UTC, not your local time.';

// The offset an instant was written with: Temporal parses it but does not
// return it. Anchored at the end of a text Temporal accepted: Z, or ±hh with
// optional mm, then any [zone] or [key=value] brackets. An offset with seconds
// does not match.
const OFFSET_AT_END = /(?:([zZ])|([+-])(\d{2})(?::?(\d{2}))?)(?:\[[^\]]*\])*$/;

// Temporal.PlainDate.from also accepts a date-time, so the shape of a date
// alone is read from the text (§8): extended or basic format.
const DATE_ALONE = /^(?:\d{4}-\d{2}-\d{2}|\d{8})$/;

// A '+' in a query string arrives as a space (§8). A time (after T, t or a
// space), then a space, then an offset as 07, 0700 or 07:00, has no other
// meaning, so the space is read as '+'. Temporal cannot parse the text before
// the repair, so the shape is matched here.
const SPACE_FOR_PLUS =
  /^(.*[Tt ]\d{2}(?::?\d{2}(?::?\d{2}(?:[.,]\d+)?)?)?) (\d{2}(?::?\d{2})?(?:\[[^\]]*\])*)$/;

type Advice = (raw: string, day: Temporal.PlainDate) => string;

const failure = (path: string, message: string): Check<never> => ({
  ok: false,
  errors: [{ path, message }],
});

const writeDateAlone: Advice = (raw, day) =>
  `'${raw}' has no time or UTC offset, so the moment it names is ` +
  `unknown. Add the time and your UTC offset, for example ` +
  `${day.toString()}T09:00:00+07:00. ${Z_ADVICE}`;

// Read bounds: what is wrong, then §8's advice for each bound verbatim.
const toDateAlone: Advice = (raw, day) =>
  `'${raw}' has no time or UTC offset: to include all of ${day.toString()}, ` +
  `send the start of the next day, for example ` +
  `${day.add({ days: 1 }).toString()}T00:00:00+07:00.`;

const fromDateAlone: Advice = (raw, day) =>
  `'${raw}' has no time or UTC offset: to start at ${day.toString()}, ` +
  `send the start of that day, for example ${day.toString()}T00:00:00+07:00.`;

// Why Temporal.Instant.from refused the text, in the order of §8 and the plan:
// a date alone, then a date-time with no offset, then anything else.
// Temporal reports a text it cannot read by throwing; lodash's attempt returns
// the Error instead, and a Temporal value is never an Error.
function refusal(raw: string, dateAlone: Advice): string {
  const trimmed = raw.trim();
  if (DATE_ALONE.test(trimmed)) {
    const day = attempt(() => Temporal.PlainDate.from(trimmed));
    if (!isError(day)) return dateAlone(raw, day);
  }
  const local = attempt(() => Temporal.PlainDateTime.from(raw));
  if (!isError(local)) {
    return (
      `'${raw}' has no UTC offset, so the moment it names is unknown. ` +
      `Add your UTC offset, for example ${local.toString()}+07:00. ${Z_ADVICE}`
    );
  }
  return (
    `'${raw}' is not an RFC 3339 date-time, or names a day that does not ` +
    `exist. Send a date, a time and a UTC offset, for example ` +
    `2025-02-10T09:00:00+07:00.`
  );
}

// The checks shared by writes and read bounds: a string, an instant, and an
// offset that exists (−12:00…+14:00 in whole minutes).
function parseInstant(
  raw: unknown,
  path: string,
  dateAlone: Advice,
): Check<{ text: string; instant: Temporal.Instant }> {
  if (typeof raw !== 'string') {
    return failure(
      path,
      'must be a string holding an RFC 3339 date-time with a UTC offset, ' +
        'for example 2025-02-10T09:00:00+07:00.',
    );
  }
  const instant = attempt(() => Temporal.Instant.from(raw));
  if (isError(instant)) return failure(path, refusal(raw, dateAlone));
  // An offset with seconds does not match the pattern: undefined.
  const minutes = OFFSET_AT_END.test(raw) ? readOffsetMinutes(raw) : undefined;
  if (
    minutes === undefined ||
    (minutes !== null &&
      (minutes < MIN_UTC_OFFSET_MINUTES || minutes > MAX_UTC_OFFSET_MINUTES))
  ) {
    return failure(
      path,
      `'${raw}' has a UTC offset that does not exist. Real offsets run from ` +
        '-12:00 to +14:00 in whole minutes.',
    );
  }
  return { ok: true, value: { text: raw, instant } };
}

const earliestMessage = (raw: string) =>
  `'${raw}' is before ${EARLIEST_INSTANT}, the earliest moment accepted. ` +
  'Check the year.';

const latestMessage = (raw: string) =>
  `'${raw}' is after ${LATEST_INSTANT}, the latest moment accepted. ` +
  'Check the year.';

const toDate = (instant: Temporal.Instant) =>
  new Date(instant.epochMilliseconds);

// A write's `date`: cut toward the past to the millisecond (PostgreSQL would
// round), no later than now + 15 minutes, not before 1900.
export function parseWriteDate(
  raw: unknown,
  path: string,
  now: Temporal.Instant,
): Check<{ performedAt: Date; utcOffsetMinutes: number | null }> {
  const parsed = parseInstant(raw, path, writeDateAlone);
  if (!parsed.ok) return parsed;
  const { text } = parsed.value;
  const instant = parsed.value.instant.round({
    smallestUnit: 'millisecond',
    roundingMode: 'floor',
  });
  const utcOffsetMinutes = readOffsetMinutes(text);
  const latest = now.add({ milliseconds: FUTURE_TOLERANCE_MS });
  if (Temporal.Instant.compare(instant, latest) > 0) {
    // A local time sent with Z is the likely cause only when the text was
    // written as UTC; an explicit offset is not blamed on Z.
    const zCause =
      utcOffsetMinutes === null || utcOffsetMinutes === 0
        ? ' A local time sent with Z is the likely cause: Z means UTC, so ' +
          'send your UTC offset instead, for example +07:00.'
        : '';
    return failure(
      path,
      `'${text}' is more than ${FUTURE_TOLERANCE_MS / 60_000} minutes after ` +
        `the server's time, ${now.toString({ smallestUnit: 'millisecond' })}.` +
        zCause,
    );
  }
  if (Temporal.Instant.compare(instant, EARLIEST) < 0) {
    return failure(path, earliestMessage(text));
  }
  return {
    ok: true,
    value: {
      performedAt: toDate(instant),
      utcOffsetMinutes,
    },
  };
}

// A `from` or `to` query bound: rounded up to the millisecond, so that
// `from <= performed_at < to` holds for stored millisecond values; not before
// 1900, and not after LATEST_INSTANT once rounded. Design §8 says "no upper
// limit"; the year-9999 bound is a controller ruling (final review B1), since
// a later instant reached PostgreSQL as a six-digit year and answered 500.
export function parseReadBound(
  raw: unknown,
  path: string,
  bound: 'from' | 'to',
): Check<Date> {
  const parsed = parseInstant(
    raw,
    path,
    bound === 'to' ? toDateAlone : fromDateAlone,
  );
  if (!parsed.ok) return parsed;
  const instant = parsed.value.instant.round({
    smallestUnit: 'millisecond',
    roundingMode: 'ceil',
  });
  if (Temporal.Instant.compare(instant, EARLIEST) < 0) {
    return failure(path, earliestMessage(parsed.value.text));
  }
  if (Temporal.Instant.compare(instant, LATEST) > 0) {
    return failure(path, latestMessage(parsed.value.text));
  }
  return { ok: true, value: toDate(instant) };
}

// Runs on a query value before parseReadBound.
export function repairOffsetPlus(raw: string): string {
  return raw.replace(SPACE_FOR_PLUS, '$1+$2');
}

// A half-open range [from, to) with equal ends is empty; checked after the
// bounds were rounded. The error goes on fromPath.
export function checkRange(
  from: Date | undefined,
  to: Date | undefined,
  fromPath: string,
  toPath: string,
): FieldError[] {
  if (from === undefined || to === undefined) return [];
  if (from.getTime() < to.getTime()) return [];
  return [
    {
      path: fromPath,
      message:
        `${fromPath} must be earlier than ${toPath}: ${fromPath} is included ` +
        `and ${toPath} is not, so this range is empty.`,
    },
  ];
}

// The offset a text ends with, in minutes east of UTC. `Z` and `-00:00` mean
// "UTC known, local offset unknown" (RFC 9557), so they give null. It reads
// only the end of the text: it checks neither the range (`+15:00` gives 900)
// nor that the text is an instant (`2025-02-10` gives -600, read as `-10`),
// so callers validate first, as parseInstant does. It throws only when the
// end matches no offset at all (for example an offset with seconds).
export function readOffsetMinutes(text: string): number | null {
  const match = OFFSET_AT_END.exec(text);
  if (!match) throw new RangeError(`No UTC offset in '${text}'`);
  const [, zulu, sign, hours, mins = '00'] = match;
  if (zulu) return null;
  const minutes = Number(hours) * 60 + Number(mins);
  if (minutes === 0) return sign === '-' ? null : 0;
  return sign === '-' ? -minutes : minutes;
}

// The stored offset as a response prints it: 420 → '+07:00'. Temporal has no
// formatter for a bare offset in minutes, so it is padded here.
export function formatUtcOffset(minutes: number | null): string | null {
  if (minutes === null) return null;
  const abs = Math.abs(minutes);
  const hhmm = `${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  return `${minutes < 0 ? '-' : '+'}${hhmm}`;
}
