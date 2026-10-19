import assert from 'node:assert/strict';
import { ActivityRanking, DayRanking, RankingResponse } from '../contract';

export function dayAt(body: RankingResponse, day: number): DayRanking {
  assert.ok(Array.isArray(body?.days), 'response.days must be an array');
  const d = body.days[day - 1];
  assert.ok(d, `response has no day ${day} (got ${body.days.length} days)`);
  return d;
}

export function activityOn(body: RankingResponse, day: number, activity: string): ActivityRanking {
  const d = dayAt(body, day);
  const a = d.activities.find((x) => x.activity === activity);
  assert.ok(a, `day ${day} (${d.date}) has no "${activity}" entry`);
  return a;
}

export function eachDay(body: RankingResponse): number[] {
  assert.ok(Array.isArray(body?.days) && body.days.length > 0, 'response.days must be a non-empty array');
  return body.days.map((_, i) => i + 1);
}

/** Compact, readable summary used in assertion messages. */
export function describeDay(d: DayRanking): string {
  return `${d.date}: ` + d.activities.map((a) => `#${a.rank} ${a.activity} (${a.score})`).join(', ');
}
