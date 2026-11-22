import type Decimal from 'decimal.js';
// Loaded for its setting: the arithmetic below runs at 40 digits (§6).
import '../../common/decimal';

// The record metrics of design §7. Pure functions on exact kilograms: nothing
// here rounds, and display() is the only place a result becomes a number.

export type KgSet = { reps: number; weightKg: Decimal };

export type CandidateSet = KgSet & {
  entryId: string;
  performedAt: Date;
  setNumber: number;
};

export type PrMetric = 'weight' | 'volume' | 'e1rm';

export function volumeKg(s: KgSet): Decimal {
  return s.weightKg.times(s.reps);
}

// Epley, the brief's formula, for every rep count including 1 (D-12).
export function e1rmKg(s: KgSet): Decimal {
  return s.weightKg.times(30 + s.reps).div(30);
}

// The exact score used for ordering: no division and no rounding, so the PR
// query's three multiplications order sets exactly as this does (§7).
export function rank(m: PrMetric, s: KgSet): Decimal {
  switch (m) {
    case 'weight':
      return s.weightKg;
    case 'volume':
      return s.weightKg.times(s.reps);
    case 'e1rm':
      return s.weightKg.times(30 + s.reps);
  }
}

// Domain logic: "the moment the record was first achieved" (§7). Highest
// rank, then earliest performedAt, then lowest entryId (string order, which
// for lower-case UUIDv7 text is creation order), then lowest setNumber.
function isBetter(m: PrMetric, a: CandidateSet, b: CandidateSet): boolean {
  const byRank = rank(m, a).comparedTo(rank(m, b));
  if (byRank !== 0) return byRank > 0;
  const byTime = a.performedAt.getTime() - b.performedAt.getTime();
  if (byTime !== 0) return byTime < 0;
  if (a.entryId !== b.entryId) return a.entryId < b.entryId;
  return a.setNumber < b.setNumber;
}

export function pickRecord(
  m: PrMetric,
  sets: CandidateSet[],
): CandidateSet | null {
  let best: CandidateSet | null = null;
  for (const s of sets) {
    if (best === null || isBetter(m, s, best)) best = s;
  }
  return best;
}
