import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { driverErrorCode } from '../common/problem';
import { CatalogLoader } from './catalog-loader';
import { CatalogSnapshot } from './catalog-snapshot';
import { ExerciseCatalog } from './exercise-catalog';

// Written by hand (D-28): no scheduling or retry package models these four
// rules of design §10.2 together, and the fake-timer tests in
// database-catalog.spec.ts pin each of them:
//   1. a setTimeout chain: the next load is scheduled when the last one ends;
//   2. one load at a time: a refresh asked for during a load waits for it,
//      then runs its own;
//   3. loads are numbered, and a finished load replaces the snapshot only if
//      its number is higher;
//   4. a failed load keeps the last snapshot, logs a warning with its age,
//      is tried once more after retryAfterFailureMs, then waits the interval.

export type CatalogRefreshOptions = {
  refreshMs: number;
  retryAfterFailureMs: number;
  bootDeadlineMs: number;
};

// The pause between two boot attempts; the deadline bounds them all.
const BOOT_RETRY_MS = 1_000;

export class DatabaseExerciseCatalog
  implements ExerciseCatalog, OnModuleInit, OnModuleDestroy
{
  private current: CatalogSnapshot | undefined;
  // performance.now() when the current snapshot was installed: a monotonic
  // duration for the warning's age, not the time of day, so it needs no CLOCK.
  private installedAt = 0;
  private loadsStarted = 0;
  // Every load runs at the end of this chain; it never rejects.
  private queue: Promise<void> = Promise.resolve();
  // The one pending timer: a boot retry or the next refresh.
  private timer: NodeJS.Timeout | undefined;
  // Ends the pause between two boot attempts early, when boot gives up.
  private wakeBoot: (() => void) | undefined;
  private stopped = false;

  constructor(
    private readonly loader: CatalogLoader,
    private readonly options: CatalogRefreshOptions,
    private readonly logger: Logger,
  ) {}

  snapshot(): CatalogSnapshot {
    if (!this.current) {
      throw new Error('The exercise catalog has not been loaded yet');
    }
    return this.current;
  }

  refresh(): Promise<void> {
    return this.enqueue(() => this.refreshOnce(false));
  }

  // Nest awaits this before the app listens, so no request arrives before
  // the first snapshot (design §10.2). Throws after the deadline, and the
  // process exits; compose restarts it.
  async onModuleInit(): Promise<void> {
    let gaveUp = false;
    let deadline: NodeJS.Timeout | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      deadline = setTimeout(() => {
        gaveUp = true;
        this.clearTimer();
        this.wakeBoot?.();
        const seconds = this.options.bootDeadlineMs / 1000;
        reject(
          new Error(
            `The exercise catalog could not be loaded within ${seconds} s`,
          ),
        );
      }, this.options.bootDeadlineMs);
    });
    try {
      await Promise.race([this.boot(() => gaveUp), timedOut]);
    } finally {
      clearTimeout(deadline);
    }
    this.schedule(this.options.refreshMs, false);
  }

  // Stops the timer (design §13). A load already running is not awaited, so a
  // load that never answers cannot hold up shutdown; when it ends it neither
  // logs nor schedules anything.
  onModuleDestroy(): void {
    this.stopped = true;
    this.clearTimer();
    this.wakeBoot?.();
  }

  private boot(gaveUp: () => boolean): Promise<void> {
    return this.enqueue(async () => {
      while (!gaveUp() && !this.stopped) {
        try {
          await this.loadAndInstall();
          return;
        } catch (error) {
          if (this.stopped) return;
          this.logger.warn(
            { code: driverErrorCode(error) },
            'Catalog load at boot failed; trying again',
          );
        }
        if (gaveUp() || this.stopped) return;
        await new Promise<void>((resolve) => {
          this.wakeBoot = resolve;
          this.timer = setTimeout(resolve, BOOT_RETRY_MS);
        });
        this.wakeBoot = undefined;
      }
    });
  }

  private enqueue(run: () => Promise<void>): Promise<void> {
    const next = this.queue.then(run);
    // Every run catches its own errors; should one escape, the chain must
    // still run the loads queued after it.
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async refreshOnce(isRetry: boolean): Promise<void> {
    if (this.stopped) return;
    try {
      await this.loadAndInstall();
      this.schedule(this.options.refreshMs, false);
    } catch (error) {
      if (this.stopped) return;
      this.logger.warn(
        {
          code: driverErrorCode(error),
          snapshotLoadNumber: this.current?.loadNumber,
          snapshotAgeSeconds: Math.round(
            (performance.now() - this.installedAt) / 1000,
          ),
        },
        'Catalog refresh failed; serving the last snapshot',
      );
      if (isRetry) this.schedule(this.options.refreshMs, false);
      else this.schedule(this.options.retryAfterFailureMs, true);
    }
  }

  private async loadAndInstall(): Promise<void> {
    this.loadsStarted += 1;
    const loadNumber = this.loadsStarted;
    const next = new CatalogSnapshot(await this.loader.load(), loadNumber);
    if (!this.current || next.loadNumber > this.current.loadNumber) {
      this.current = next;
      this.installedAt = performance.now();
    }
  }

  // Replaces any pending timer, so one is pending at most.
  private schedule(ms: number, isRetry: boolean): void {
    if (this.stopped) return;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.enqueue(() => this.refreshOnce(isRetry));
    }, ms);
  }

  private clearTimer(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
