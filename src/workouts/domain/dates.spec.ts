import { EARLIEST_INSTANT } from '../../common/limits';
import {
  checkRange,
  formatUtcOffset,
  parseReadBound,
  parseWriteDate,
  readOffsetMinutes,
  repairOffsetPlus,
} from './dates';

// The fixed clock value for every write (design §8: "now" is injected).
const now = Temporal.Instant.from('2025-02-11T03:00:00Z');

// One millisecond before the lower bound of §8.
const beforeEarliest = Temporal.Instant.from(EARLIEST_INSTANT)
  .subtract({ milliseconds: 1 })
  .toString();

// A successful write as the tests compare it: the instant as toISOString()
// prints it, and the offset kept for display.
function written(raw: unknown) {
  const result = parseWriteDate(raw, 'date', now);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return [
    result.value.performedAt.toISOString(),
    result.value.utcOffsetMinutes,
  ];
}

function readBound(raw: unknown, bound: 'from' | 'to') {
  const result = parseReadBound(raw, bound, bound);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value.toISOString();
}

const noOffsetMessage = (raw: string, example: string) =>
  `'${raw}' has no UTC offset, so the moment it names is unknown. ` +
  `Add your UTC offset, for example ${example}. ` +
  'Z means UTC, not your local time.';

const notADateTimeMessage = (raw: string) =>
  `'${raw}' is not an RFC 3339 date-time, or names a day that does not ` +
  'exist. Send a date, a time and a UTC offset, for example ' +
  '2025-02-10T09:00:00+07:00.';

const offsetMessage = (raw: string) =>
  `'${raw}' has a UTC offset that does not exist. Real offsets run from ` +
  '-12:00 to +14:00 in whole minutes.';

const earliestMessage = (raw: string) =>
  `'${raw}' is before 1900-01-01T00:00:00Z, the earliest moment accepted. ` +
  'Check the year.';

describe('parseWriteDate', () => {
  it.each([
    // every row of the §8 table
    ['2025-02-10T05:30:00+07:00', '2025-02-09T22:30:00.000Z', 420],
    ['2025-02-10T12:30:00Z', '2025-02-10T12:30:00.000Z', null],
    ['2025-02-10T12:30:00+00:00', '2025-02-10T12:30:00.000Z', 0],
    ['2025-02-10T12:30:00.123Z', '2025-02-10T12:30:00.123Z', null],
    ['2025-02-10T12:30:00.123456Z', '2025-02-10T12:30:00.123Z', null],
    // the bracket is ignored, the offset decides
    [
      '2025-02-10T06:30:00+07:00[Asia/Ho_Chi_Minh]',
      '2025-02-09T23:30:00.000Z',
      420,
    ],
    // cut toward the past before 1970 too
    ['1950-06-01T10:00:00.1239Z', '1950-06-01T10:00:00.123Z', null],
    // offsets read from the text
    ['2025-02-10T05:30:00-07:00', '2025-02-10T12:30:00.000Z', -420],
    ['2025-02-10T05:30:00+05:45', '2025-02-09T23:45:00.000Z', 345],
    ['2025-02-10T12:30:00-00:00', '2025-02-10T12:30:00.000Z', null],
    // accepted ISO 8601 variants
    ['2025-02-10 05:30:00+07:00', '2025-02-09T22:30:00.000Z', 420],
    ['2025-02-10t05:30:00z', '2025-02-10T05:30:00.000Z', null],
    ['2025-02-10T05:30:00+07', '2025-02-09T22:30:00.000Z', 420],
    ['2025-02-10T05:30:00+0700', '2025-02-09T22:30:00.000Z', 420],
    ['20250210T053000Z', '2025-02-10T05:30:00.000Z', null],
    // a leap second is read as :59
    ['2016-12-31T23:59:60Z', '2016-12-31T23:59:59.000Z', null],
    // a leap day that exists
    ['2024-02-29T09:00:00Z', '2024-02-29T09:00:00.000Z', null],
  ])('%s → %s, offset %p', (raw, instant, offset) =>
    expect(written(raw)).toEqual([instant, offset]),
  );

  it.each([
    // a date alone: exactly the §8 message
    [
      '2025-02-10',
      "'2025-02-10' has no time or UTC offset, so the moment it names is " +
        'unknown. Add the time and your UTC offset, for example ' +
        '2025-02-10T09:00:00+07:00. Z means UTC, not your local time.',
    ],
    // no offset: exactly the §8 message, not the date-alone one
    [
      '2025-02-10T06:30:00',
      noOffsetMessage('2025-02-10T06:30:00', '2025-02-10T06:30:00+07:00'),
    ],
    // Python's str(datetime) on a naive value
    [
      '2025-02-10 06:30:00',
      noOffsetMessage('2025-02-10 06:30:00', '2025-02-10T06:30:00+07:00'),
    ],
    // an offset that does not exist, or not in whole minutes
    ['2025-02-10T05:30:00+15:00', offsetMessage('2025-02-10T05:30:00+15:00')],
    [
      '2025-02-10T05:30:00+07:00:30',
      offsetMessage('2025-02-10T05:30:00+07:00:30'),
    ],
    // an offset alone, and days that do not exist
    ['+15:00', notADateTimeMessage('+15:00')],
    ['2025-02-30T09:00:00Z', notADateTimeMessage('2025-02-30T09:00:00Z')],
    ['2025-02-29T09:00:00Z', notADateTimeMessage('2025-02-29T09:00:00Z')],
  ])('%s → 400 with its path and message', (raw, message) =>
    expect(parseWriteDate(raw, 'entries[2].date', now)).toEqual({
      ok: false,
      errors: [{ path: 'entries[2].date', message }],
    }),
  );

  it('refuses a number: the field is a string', () =>
    expect(parseWriteDate(1739165400000, 'date', now)).toEqual({
      ok: false,
      errors: [
        {
          path: 'date',
          message:
            'must be a string holding an RFC 3339 date-time with a UTC ' +
            'offset, for example 2025-02-10T09:00:00+07:00.',
        },
      ],
    }));

  describe('bounds', () => {
    it('accepts now + 15 minutes', () =>
      expect(written(now.add({ minutes: 15 }).toString())).toEqual([
        '2025-02-11T03:15:00.000Z',
        null,
      ]));

    it('refuses now + 15 minutes 1 ms, showing the server time and naming Z', () => {
      const raw = now.add({ minutes: 15, milliseconds: 1 }).toString();
      expect(parseWriteDate(raw, 'date', now)).toEqual({
        ok: false,
        errors: [
          {
            path: 'date',
            message:
              `'${raw}' is more than 15 minutes after the server's time, ` +
              '2025-02-11T03:00:00.000Z. A local time sent with Z is the ' +
              'likely cause: Z means UTC, so send your UTC offset instead, ' +
              'for example +07:00.',
          },
        ],
      });
    });

    it('accepts 1900-01-01T00:00:00Z', () =>
      expect(written(EARLIEST_INSTANT)).toEqual([
        '1900-01-01T00:00:00.000Z',
        null,
      ]));

    it('refuses one millisecond earlier', () =>
      expect(parseWriteDate(beforeEarliest, 'date', now)).toEqual({
        ok: false,
        errors: [{ path: 'date', message: earliestMessage(beforeEarliest) }],
      }));
  });
});

describe('parseReadBound', () => {
  it.each([
    ['2025-02-01T00:00:00+07:00', 'from', '2025-01-31T17:00:00.000Z'],
    ['2025-02-28T17:00:00Z', 'to', '2025-02-28T17:00:00.000Z'],
    // finer digits round up, before and after 1970
    ['2025-02-01T00:00:00.1231Z', 'from', '2025-02-01T00:00:00.124Z'],
    ['1950-06-01T10:00:00.1231Z', 'to', '1950-06-01T10:00:00.124Z'],
    [EARLIEST_INSTANT, 'from', '1900-01-01T00:00:00.000Z'],
  ] as const)('%s as a %s bound → %s', (raw, bound, instant) =>
    expect(readBound(raw, bound)).toBe(instant),
  );

  it.each([
    // a date alone: exactly the §8 advice for each bound
    [
      '2025-02-28',
      'to',
      'to include all of 2025-02-28, send the start of the next day, for ' +
        'example 2025-03-01T00:00:00+07:00',
    ],
    [
      '2025-02-01',
      'from',
      'to start at 2025-02-01, send the start of that day, for example ' +
        '2025-02-01T00:00:00+07:00',
    ],
    // no offset: as on writes
    [
      '2025-02-01T00:00:00',
      'from',
      noOffsetMessage('2025-02-01T00:00:00', '2025-02-01T00:00:00+07:00'),
    ],
    // the same 1900 floor as writes
    [beforeEarliest, 'from', earliestMessage(beforeEarliest)],
  ] as const)(
    '%s as a %s bound → 400 with its message',
    (raw, bound, message) =>
      expect(parseReadBound(raw, bound, bound)).toEqual({
        ok: false,
        errors: [{ path: bound, message }],
      }),
  );
});

describe('checkRange', () => {
  const rangeMessage =
    'from must be earlier than to: from is included and to is not, so this ' +
    'range is empty.';

  it('accepts from before to, and either bound alone', () => {
    const from = new Date(readBound('2025-02-01T00:00:00+07:00', 'from'));
    const to = new Date(readBound('2025-02-28T17:00:00Z', 'to'));
    expect(checkRange(from, to, 'from', 'to')).toEqual([]);
    expect(checkRange(from, undefined, 'from', 'to')).toEqual([]);
    expect(checkRange(undefined, to, 'from', 'to')).toEqual([]);
  });

  it('refuses from equal to to after rounding, on fromPath', () => {
    const from = new Date(readBound('2025-02-01T00:00:00.1231Z', 'from'));
    const to = new Date(readBound('2025-02-01T00:00:00.124Z', 'to'));
    expect(checkRange(from, to, 'from', 'to')).toEqual([
      { path: 'from', message: rangeMessage },
    ]);
  });

  it('refuses from after to, on fromPath', () => {
    const from = new Date(readBound('2025-02-28T17:00:00Z', 'from'));
    const to = new Date(readBound('2025-02-01T00:00:00+07:00', 'to'));
    expect(checkRange(from, to, 'from', 'to')).toEqual([
      { path: 'from', message: rangeMessage },
    ]);
  });
});

describe('repairOffsetPlus', () => {
  it.each([
    ['2025-02-01T00:00:00 07:00', '2025-02-01T00:00:00+07:00'],
    ['2025-02-01T00:00:00 0700', '2025-02-01T00:00:00+0700'],
    ['2025-02-01T00:00:00 07', '2025-02-01T00:00:00+07'],
    ['2025-02-01 00:00:00 07:00', '2025-02-01 00:00:00+07:00'],
  ])('restores the + in %s', (raw, repaired) =>
    expect(repairOffsetPlus(raw)).toBe(repaired),
  );

  it.each([
    '2025-02-01T00:00:00Z',
    // a space for T and no offset
    '2025-02-01 07:00',
  ])('leaves %s unchanged', (raw) => expect(repairOffsetPlus(raw)).toBe(raw));
});

describe('readOffsetMinutes', () => {
  it.each([
    ['2025-02-10T05:30:00+07:00', 420],
    ['2025-02-10T05:30:00-07:00', -420],
    ['2025-02-10T05:30:00+05:45', 345],
    ['2025-02-10T05:30:00+00:00', 0],
    ['2025-02-10T05:30:00Z', null],
    ['2025-02-10T05:30:00-00:00', null],
  ])('%s → %p', (text, minutes) =>
    expect(readOffsetMinutes(text)).toBe(minutes),
  );
});

describe('formatUtcOffset', () => {
  it.each([
    [420, '+07:00'],
    [-420, '-07:00'],
    [345, '+05:45'],
    [0, '+00:00'],
    [null, null],
  ])('%p → %p', (minutes, text) => expect(formatUtcOffset(minutes)).toBe(text));
});
