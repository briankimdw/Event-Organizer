import assert from 'node:assert/strict';
import { currentStreak, longestStreak } from './streaks.ts';

assert.equal(currentStreak(['2026-01-03', '2026-01-02', '2026-01-01'], '2026-01-03'), 3);
// today not done yet, yesterday was: streak still alive
assert.equal(currentStreak(['2026-01-02', '2026-01-01'], '2026-01-03'), 2);
// missed yesterday: streak broken
assert.equal(currentStreak(['2026-01-01'], '2026-01-03'), 0);
assert.equal(currentStreak([], '2026-01-03'), 0);
assert.equal(longestStreak(['2026-01-01', '2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07']), 3);
// crosses a month boundary
assert.equal(longestStreak(['2026-01-31', '2026-02-01']), 2);
console.log('streaks: ok');
