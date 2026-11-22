// The only source of the current time in src/ (design §8): services take it
// through the CLOCK token, so tests fix "now".
export interface Clock {
  now(): Temporal.Instant;
}

export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = { now: () => Temporal.Now.instant() };

export function fixedClock(iso: string): Clock {
  const instant = Temporal.Instant.from(iso);
  return { now: () => instant };
}
