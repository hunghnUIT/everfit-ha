import { Logger } from '@nestjs/common';
import { CatalogRows } from './catalog-snapshot';
import { CatalogLoader } from './catalog-loader';
import { DatabaseExerciseCatalog } from './database-catalog';

// The four refresh rules of design §10.2, on fake timers and a fake loader.

const REFRESH_MS = 300_000;
const RETRY_MS = 10_000;
const DEADLINE_MS = 10_000;

// A catalog whose only content is the groups given, so a test can tell which
// load a snapshot came from.
function rows(...groups: string[]): CatalogRows {
  return { exercises: [], groups };
}

function dbDown(): Error {
  return Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), {
    code: 'ECONNREFUSED',
  });
}

type Deferred = {
  promise: Promise<CatalogRows>;
  resolve: (value: CatalogRows) => void;
};

function deferred(): Deferred {
  let resolve!: (value: CatalogRows) => void;
  const promise = new Promise<CatalogRows>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function setup() {
  const load = jest.fn<Promise<CatalogRows>, []>();
  const loader: CatalogLoader = { load };
  const warn = jest.fn();
  const logger = { warn } as unknown as Logger;
  const catalog = new DatabaseExerciseCatalog(
    loader,
    {
      refreshMs: REFRESH_MS,
      retryAfterFailureMs: RETRY_MS,
      bootDeadlineMs: DEADLINE_MS,
    },
    logger,
  );
  return { load, warn, catalog };
}

// Lets settled promises run their continuations without moving the clock.
const flush = () => jest.advanceTimersByTimeAsync(0);

describe('DatabaseExerciseCatalog', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('a failing refresh keeps the last snapshot, retries once after 10 s, then waits the interval', async () => {
    const { load, warn, catalog } = setup();
    load.mockResolvedValueOnce(rows('chest')).mockRejectedValue(dbDown());
    await catalog.onModuleInit();
    expect(load).toHaveBeenCalledTimes(1);

    // The timer's load fails: the snapshot stays, a warning gives its age.
    await jest.advanceTimersByTimeAsync(REFRESH_MS);
    expect(load).toHaveBeenCalledTimes(2);
    expect(catalog.snapshot().hasMuscleGroup('chest')).toBe(true);
    expect(catalog.snapshot().loadNumber).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenLastCalledWith(
      { code: 'ECONNREFUSED', snapshotLoadNumber: 1, snapshotAgeSeconds: 300 },
      'Catalog refresh failed; serving the last snapshot',
    );
    // The driver's message names the host; it is never logged.
    expect(JSON.stringify(warn.mock.calls)).not.toContain('10.0.0.5');

    // Once more, 10 s later.
    await jest.advanceTimersByTimeAsync(RETRY_MS - 1);
    expect(load).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenLastCalledWith(
      expect.objectContaining({ snapshotAgeSeconds: 310 }),
      expect.any(String),
    );

    // That retry failed too: back to the interval, not another 10 s.
    await jest.advanceTimersByTimeAsync(REFRESH_MS - 1);
    expect(load).toHaveBeenCalledTimes(3);
    await jest.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(4);

    // A failure on the timer earns its own retry, which here succeeds.
    load.mockResolvedValueOnce(rows('chest', 'neck'));
    await jest.advanceTimersByTimeAsync(RETRY_MS);
    expect(load).toHaveBeenCalledTimes(5);
    expect(catalog.snapshot().hasMuscleGroup('neck')).toBe(true);

    // After a success the next load is an interval away.
    await jest.advanceTimersByTimeAsync(REFRESH_MS - 1);
    expect(load).toHaveBeenCalledTimes(5);
    await jest.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(6);
    expect(catalog.snapshot().hasMuscleGroup('neck')).toBe(true);
  });

  it('a failing refresh() resolves, keeps the snapshot and is retried after 10 s', async () => {
    const { load, catalog } = setup();
    load
      .mockResolvedValueOnce(rows('chest'))
      .mockRejectedValueOnce(dbDown())
      .mockResolvedValueOnce(rows('chest', 'neck'));
    await catalog.onModuleInit();

    await expect(catalog.refresh()).resolves.toBeUndefined();
    expect(catalog.snapshot().hasMuscleGroup('neck')).toBe(false);

    await jest.advanceTimersByTimeAsync(RETRY_MS);
    expect(load).toHaveBeenCalledTimes(3);
    expect(catalog.snapshot().hasMuscleGroup('neck')).toBe(true);
  });

  it('a refresh asked for during a load runs after it', async () => {
    const { load, catalog } = setup();
    const slow = deferred();
    load
      .mockResolvedValueOnce(rows('a'))
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(rows('c'));
    await catalog.onModuleInit();

    const first = catalog.refresh();
    await flush();
    expect(load).toHaveBeenCalledTimes(2);

    // Asked for while the first load runs: it does not start a second one.
    let secondDone = false;
    const second = catalog.refresh().then(() => {
      secondDone = true;
    });
    await flush();
    expect(load).toHaveBeenCalledTimes(2);

    slow.resolve(rows('b'));
    await first;
    expect(catalog.snapshot().hasMuscleGroup('b')).toBe(true);
    await second;
    expect(secondDone).toBe(true);
    expect(load).toHaveBeenCalledTimes(3);
    expect(catalog.snapshot().hasMuscleGroup('c')).toBe(true);
    expect(catalog.snapshot().loadNumber).toBe(3);
  });

  it('a timer that fires during a refresh() waits for it', async () => {
    const { load, catalog } = setup();
    const slow = deferred();
    load
      .mockResolvedValueOnce(rows('a'))
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(rows('c'));
    await catalog.onModuleInit();

    await jest.advanceTimersByTimeAsync(REFRESH_MS - 1);
    const asked = catalog.refresh();
    await jest.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);

    slow.resolve(rows('b'));
    await asked;
    await flush();
    expect(load).toHaveBeenCalledTimes(3);
    expect(catalog.snapshot().hasMuscleGroup('c')).toBe(true);
  });

  it('an older load never replaces a newer snapshot', async () => {
    const { load, catalog } = setup();
    const slow = deferred();
    load
      .mockResolvedValueOnce(rows('a'))
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(rows('c'));
    await catalog.onModuleInit();

    // Two refreshes; the older load is slow, the newer one's rows are ready at
    // once. Today rule 2 keeps them from overlapping; this test is what holds
    // if they ever do: the snapshot that remains is the newer load's.
    const older = catalog.refresh();
    const newer = catalog.refresh();
    await flush();
    slow.resolve(rows('b'));
    await Promise.all([older, newer]);
    await flush();

    expect(catalog.snapshot().loadNumber).toBe(3);
    expect(catalog.snapshot().hasMuscleGroup('c')).toBe(true);
    expect(catalog.snapshot().hasMuscleGroup('b')).toBe(false);
  });

  it('boot keeps loading until a load succeeds, then schedules the interval', async () => {
    const { load, catalog } = setup();
    load
      .mockRejectedValueOnce(dbDown())
      .mockRejectedValueOnce(dbDown())
      .mockResolvedValueOnce(rows('chest'));

    const init = catalog.onModuleInit();
    await jest.advanceTimersByTimeAsync(5_000);
    await init;

    expect(load).toHaveBeenCalledTimes(3);
    expect(catalog.snapshot().hasMuscleGroup('chest')).toBe(true);
    expect(jest.getTimerCount()).toBe(1);
  });

  it('boot gives up after the deadline and throws', async () => {
    const { load, catalog } = setup();
    load.mockRejectedValue(dbDown());

    const init = catalog.onModuleInit();
    const outcome = expect(init).rejects.toThrow(
      'The exercise catalog could not be loaded within 10 s',
    );
    await jest.advanceTimersByTimeAsync(DEADLINE_MS - 1);
    expect(load.mock.calls.length).toBeGreaterThan(1);
    await jest.advanceTimersByTimeAsync(1);
    await outcome;

    // Nothing is left scheduled, and no load starts afterwards.
    expect(jest.getTimerCount()).toBe(0);
    const calls = load.mock.calls.length;
    await jest.advanceTimersByTimeAsync(REFRESH_MS);
    expect(load).toHaveBeenCalledTimes(calls);
    expect(() => catalog.snapshot()).toThrow();
  });

  it('boot gives up after the deadline when a load never answers', async () => {
    const { load, catalog } = setup();
    load.mockReturnValue(new Promise<CatalogRows>(() => {}));

    const init = catalog.onModuleInit();
    const outcome = expect(init).rejects.toThrow(/within 10 s/);
    await jest.advanceTimersByTimeAsync(DEADLINE_MS);
    await outcome;

    expect(load).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('onModuleDestroy stops the timer', async () => {
    const { load, catalog } = setup();
    load.mockResolvedValue(rows('chest'));
    await catalog.onModuleInit();
    expect(jest.getTimerCount()).toBe(1);

    catalog.onModuleDestroy();

    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(REFRESH_MS * 3);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('a load that ends after onModuleDestroy schedules nothing and logs nothing', async () => {
    const { load, warn, catalog } = setup();
    let fail!: (error: Error) => void;
    load.mockResolvedValueOnce(rows('a')).mockReturnValueOnce(
      new Promise<CatalogRows>((_, reject) => {
        fail = reject;
      }),
    );
    await catalog.onModuleInit();

    const refreshing = catalog.refresh();
    await flush();
    catalog.onModuleDestroy();
    // The pool is drained on shutdown, so the running load fails.
    fail(dbDown());
    await refreshing;

    expect(jest.getTimerCount()).toBe(0);
    expect(warn).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(REFRESH_MS * 3);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
