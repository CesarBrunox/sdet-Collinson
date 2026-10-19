/**
 * Runtime contract validation, in two layers:
 *   1. Structure: ajv against docs/openapi.yaml (required fields, types, ranges, enums,
 *      patterns, array sizes, real calendar dates via format "date"). If this fails, its problems are returned as they are.
 *   2. Semantics, ONLY for a schema-valid payload (so no structural check is duplicated and
 *      no check can meet an unexpected shape): distinct, consecutive dates; 4 distinct
 *      activities; ranks unique and in array order; order consistent with scores (ties
 *      alphabetical); label matching the score band; IANA time zones; distinct locations;
 *      candidates only (and always) for AMBIGUOUS_LOCATION.
 * Each validator returns human-readable problems (empty = valid).
 */
import {
  ErrorResponse,
  expectedSuitability,
  Location,
  LocationSearchResponse,
  RankingResponse,
} from '../contract';
import { addDays } from '../fixtures/weather';
import { isValidTimeZone } from '../time/clock';
import { validateAgainstSchema } from './schema';

type Problems = string[];

/** True for a real Gregorian date in yyyy-mm-dd form (used by the live smoke test). */
export function isRealCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function locationProblems(locations: Location[], path: string, duplicate: string): Problems {
  const p: Problems = [];
  locations.forEach((l, i) => {
    if (!isValidTimeZone(l.timezone))
      p.push(`${path}[${i}].timezone "${l.timezone}" is not an IANA time zone known to Intl`);
  });
  if (new Set(locations.map((l) => l.id)).size !== locations.length) p.push(`${path} ${duplicate}`);
  return p;
}

function rankingSemantics(r: RankingResponse): Problems {
  const p: Problems = [];
  if (!isValidTimeZone(r.location.timezone))
    p.push(`location.timezone "${r.location.timezone}" is not an IANA time zone known to Intl`);
  r.days.forEach((day, i) => {
    const path = `days[${i}]`;
    const acts = day.activities;
    if (new Set(acts.map((a) => a.activity)).size !== acts.length)
      p.push(`${path}.activities must be 4 distinct activities`);
    const ranks = acts.map((a) => a.rank);
    if (new Set(ranks).size !== ranks.length) p.push(`${path} ranks must be unique (got ${ranks.join(',')})`);
    acts.forEach((a, j) => {
      if (a.rank !== j + 1)
        p.push(`${path}.activities[${j}] must have rank ${j + 1} (array is ordered by rank)`);
      if (expectedSuitability(a.score) !== a.suitability)
        p.push(`${path}.activities[${j}].suitability "${a.suitability}" does not match score ${a.score}`);
      const prev = acts[j - 1];
      if (!prev) return;
      if (a.score > prev.score)
        p.push(
          `${path} order contradicts scores: ${prev.activity} (${prev.score}) ranked above ${a.activity} (${a.score})`,
        );
      else if (a.score === prev.score && prev.activity.localeCompare(a.activity) > 0)
        p.push(`${path} tie between ${prev.activity} and ${a.activity} is not alphabetical`);
    });
  });
  const dates = r.days.map((d) => d.date);
  if (new Set(dates).size !== dates.length) p.push(`days must have distinct dates (got ${dates.join(', ')})`);
  for (let i = 1; i < dates.length; i++)
    if (dates[i] !== addDays(dates[i - 1], 1)) {
      p.push(`days must be consecutive and ascending: ${dates[i - 1]} is followed by ${dates[i]}`);
      break;
    }
  return p;
}

function errorSemantics({ error: e }: ErrorResponse): Problems {
  const p: Problems = [];
  if (e.code === 'AMBIGUOUS_LOCATION' && !e.candidates)
    p.push('error.candidates is required for AMBIGUOUS_LOCATION');
  if (e.code !== 'AMBIGUOUS_LOCATION' && e.candidates !== undefined)
    p.push('error.candidates is only allowed for AMBIGUOUS_LOCATION');
  if (e.candidates)
    p.push(...locationProblems(e.candidates, 'error.candidates', 'must be distinct locations'));
  return p;
}

/** Schema first; semantics only when the schema accepted the payload. */
function validator<T>(schema: string, semantics: (v: T) => Problems) {
  return (v: unknown): Problems => {
    const structural = validateAgainstSchema(schema, v);
    return structural.length > 0 ? structural : semantics(v as T);
  };
}

export const VALIDATORS = {
  'location search': validator<LocationSearchResponse>('LocationSearchResponse', (r) =>
    locationProblems(r.results, 'results', 'must not repeat a location id'),
  ),
  ranking: validator<RankingResponse>('RankingResponse', rankingSemantics),
  error: validator<ErrorResponse>('ErrorResponse', errorSemantics),
} as const;
export type ResponseKind = keyof typeof VALIDATORS;
