import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { encodeCursor } from '../common/cursor';
import { toFieldErrors, VALIDATOR_OPTIONS } from '../common/validation';
import { CatalogSnapshot } from '../exercises/catalog-snapshot';
import { SHARED_UNIT_REGISTRY } from '../units/unit-registry';
import { HistoryQueryDto } from './dto/history-query.dto';
import { readHistoryQuery } from './history-query';

const USER = 'u_123';

const SNAPSHOT = new CatalogSnapshot(
  {
    exercises: [
      {
        key: 'bench press',
        name: 'Bench Press',
        muscleGroups: ['chest', 'shoulders', 'triceps'],
      },
      { key: 'push-up', name: 'Push-Up', muscleGroups: ['chest', 'triceps'] },
    ],
    groups: ['chest', 'neck', 'shoulders', 'triceps'],
  },
  1,
);

// What the global ValidationPipe does with the query: transform, then check.
async function dtoErrors(raw: Record<string, unknown>) {
  return toFieldErrors(
    await validate(plainToInstance(HistoryQueryDto, raw), VALIDATOR_OPTIONS),
  );
}

// readHistoryQuery on a query the DTO has already accepted.
function read(raw: Record<string, unknown>) {
  return readHistoryQuery(
    plainToInstance(HistoryQueryDto, raw),
    USER,
    SNAPSHOT,
    SHARED_UNIT_REGISTRY,
  );
}

function errorsOf(raw: Record<string, unknown>) {
  const result = read(raw);
  if (result.ok) throw new Error('expected a validation failure');
  return result.errors;
}

function valueOf(raw: Record<string, unknown>) {
  const result = read(raw);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
}

const ACCEPTED =
  'Accepted parameters: exercise, muscleGroup, from, to, unit, limit, cursor.';

describe('HistoryQueryDto (design §9, §9.2)', () => {
  // Review Focus 2
  it.each([
    ['exercise', ''],
    ['muscleGroup', ''],
    ['unit', ''],
    ['cursor', ''],
  ])('an empty %s= → 400 naming it', async (name, value) =>
    expect(await dtoErrors({ [name]: value })).toEqual([
      { path: name, message: expect.any(String) },
    ]),
  );

  // Review Focus 2
  it.each(['0', '101', 'abc'])('limit=%s → 400 naming limit', async (limit) =>
    expect(await dtoErrors({ limit })).toEqual([
      { path: 'limit', message: expect.any(String) },
    ]),
  );

  // Review Focus 2
  it('unit=kg&unit=lb (an array) → 400 on unit, "sent more than once"', async () =>
    expect(await dtoErrors({ unit: ['kg', 'lb'] })).toEqual([
      {
        path: 'unit',
        message: "'unit' was sent more than once; send it once.",
      },
    ]));

  // §9
  it.each(['exerciseName', 'startDate', 'page'])(
    '?%s=… → 400 naming it and listing the accepted parameters',
    async (name) =>
      expect(await dtoErrors({ [name]: '1' })).toEqual([
        {
          path: name,
          message: `Unknown query parameter '${name}'. ${ACCEPTED}`,
        },
      ]),
  );

  it('an exercise term of 100 characters passes, 101 → 400 naming exercise', async () => {
    expect(await dtoErrors({ exercise: 'a'.repeat(100) })).toEqual([]);
    expect(await dtoErrors({ exercise: 'a'.repeat(101) })).toEqual([
      { path: 'exercise', message: expect.any(String) },
    ]);
  });
});

describe('readHistoryQuery (design §9.2)', () => {
  it('defaults: limit 20, unit kg, no bound, no term, no keys, no cursor', () =>
    expect(valueOf({})).toEqual({ userId: USER, limit: 20, unit: 'kg' }));

  it('an unknown muscle group → 400 listing knownMuscleGroups()', () =>
    expect(errorsOf({ muscleGroup: 'calves' })).toEqual([
      {
        path: 'muscleGroup',
        message:
          "Unknown muscle group 'calves'. Known muscle groups: chest, neck, shoulders, triceps.",
      },
    ]));

  it('a known group is normalised and resolved to its keys; one with no exercises to []', () => {
    expect(valueOf({ muscleGroup: '  Triceps ' }).keys).toEqual([
      'bench press',
      'push-up',
    ]);
    expect(valueOf({ muscleGroup: 'neck' }).keys).toEqual([]);
  });

  it('escapes %, _ and \\ in the term after exerciseKey()', () => {
    expect(valueOf({ exercise: '  50%_Off\\Bench ' }).term).toBe(
      '50\\%\\_off\\\\bench',
    );
    // A full-width percent sign becomes '%' only under NFKC, so it is escaped
    // only if the escaping runs after exerciseKey().
    expect(valueOf({ exercise: '\u{FF05}' }).term).toBe('\\%');
    expect(valueOf({ exercise: 'BENCH' }).term).toBe('bench');
  });

  it('repairs a + that arrived as a space before parsing from and to', () => {
    const q = valueOf({
      from: '2025-02-01T00:00:00 07:00',
      to: '2025-03-01T00:00:00 0700',
    });
    expect(q.from?.toISOString()).toBe('2025-01-31T17:00:00.000Z');
    expect(q.to?.toISOString()).toBe('2025-02-28T17:00:00.000Z');
  });

  it('a date alone on from and on to → each its own §8 message', () =>
    expect(errorsOf({ from: '2025-02-01', to: '2025-02-28' })).toEqual([
      {
        path: 'from',
        message:
          "'2025-02-01' has no time or UTC offset: to start at 2025-02-01, send the start of that day, for example 2025-02-01T00:00:00+07:00.",
      },
      {
        path: 'to',
        message:
          "'2025-02-28' has no time or UTC offset: to include all of 2025-02-28, send the start of the next day, for example 2025-03-01T00:00:00+07:00.",
      },
    ]));

  it('a malformed cursor → 400; from >= to → 400', () => {
    expect(errorsOf({ cursor: 'not-a-cursor' })).toEqual([
      { path: 'cursor', message: expect.stringContaining('nextCursor') },
    ]);
    expect(
      errorsOf({ from: '2025-02-01T00:00:00Z', to: '2025-02-01T00:00:00Z' }),
    ).toEqual([{ path: 'from', message: expect.stringContaining('to') }]);
    expect(
      errorsOf({ from: '2025-03-01T00:00:00Z', to: '2025-02-01T00:00:00Z' }),
    ).toHaveLength(1);
  });

  it('a well-formed cursor, a limit and a unit alias are carried through', () => {
    const at = new Date('2025-02-09T22:30:00.123Z');
    const id = '0194f2fe-0000-7000-8000-000000000001';
    expect(
      valueOf({ cursor: encodeCursor({ at, id }), limit: '5', unit: 'LBS' }),
    ).toEqual({ userId: USER, limit: 5, unit: 'lb', cursor: { at, id } });
  });

  it('every fault of the query is reported at once', () =>
    expect(
      errorsOf({
        from: '2025-02-01',
        to: 'soon',
        cursor: 'x',
        muscleGroup: 'calves',
      }).map((e) => e.path),
    ).toEqual(['from', 'to', 'cursor', 'muscleGroup']));
});
