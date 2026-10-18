import { addDays, dayKey } from './dates.ts';

/**
 * Current streak: consecutive completed days ending today. If today isn't done
 * yet the streak is still alive as long as yesterday was, so the user isn't
 * shown a zero before they've had the chance to check in.
 */
export function currentStreak(days: string[], today: string = dayKey()): number {
  const done = new Set(days);
  let cursor = done.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (done.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export function longestStreak(days: string[]): number {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}
