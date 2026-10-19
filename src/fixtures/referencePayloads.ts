/**
 * Contract-valid reference payloads plus named, deliberately broken variants. They let the
 * @harness suite prove the runtime validators accept the contract and reject near-misses
 * without any implementation of the API existing.
 */
import { ACTIVITIES, expectedSuitability } from '../contract';
import { addDays } from './weather';

const LOCATION = {
  id: '2643743',
  name: 'London',
  country: 'United Kingdom',
  countryCode: 'GB',
  region: 'England',
  latitude: 51.50853,
  longitude: -0.12574,
  timezone: 'Europe/London',
};

export function referenceRanking() {
  return {
    location: { ...LOCATION },
    days: Array.from({ length: 7 }, (_, i) => ({
      date: addDays('2026-11-02', i),
      activities: ACTIVITIES.map((activity, j) => {
        const score = 90 - j * 25;
        return {
          activity,
          rank: j + 1,
          score,
          suitability: expectedSuitability(score),
          reasoning: 'Clear skies and 22°C',
        };
      }),
    })),
  };
}

export function referenceSearch() {
  return { query: 'Lond', results: [{ ...LOCATION }] };
}

export function referenceError() {
  return {
    error: {
      code: 'AMBIGUOUS_LOCATION',
      message: '"London" matches several places; choose one.',
      candidates: [
        { ...LOCATION },
        { ...LOCATION, id: '6058560', country: 'Canada', countryCode: 'CA', region: 'Ontario' },
      ],
    },
  };
}

type Mutator = (p: any) => unknown; // eslint-disable-line @typescript-eslint/no-explicit-any -- deliberate shape breaking

export const BROKEN: Record<'ranking' | 'location search' | 'error', Record<string, Mutator>> = {
  ranking: {
    'a missing location': (p) => (delete p.location, p),
    'a missing location timezone': (p) => (delete p.location.timezone, p),
    '6 days': (p) => (p.days.pop(), p),
    '3 activities on day 2': (p) => (p.days[1].activities.pop(), p),
    'an impossible date 2026-02-30': (p) => ((p.days[0].date = '2026-02-30'), p),
    '7 identical dates': (p) => (p.days.forEach((d: { date: string }) => (d.date = '2026-11-02')), p),
    'a gap between dates': (p) => ((p.days[3].date = addDays(p.days[3].date, 1)), p),
    'a duplicated activity on day 1': (p) => ((p.days[0].activities[3].activity = 'Skiing'), p),
    'duplicate ranks on day 1': (p) => ((p.days[0].activities[1].rank = 1), p),
    'ranks that disagree with array order': (p) => (
      (p.days[0].activities[0].rank = 2),
      (p.days[0].activities[1].rank = 1),
      p
    ),
    'activities ordered against their scores': (p) => {
      const a = p.days[0].activities;
      [a[0].score, a[3].score] = [a[3].score, a[0].score];
      a[0].suitability = expectedSuitability(a[0].score);
      a[3].suitability = expectedSuitability(a[3].score);
      return p;
    },
    'a score of -1': (p) => ((p.days[0].activities[0].score = -1), p),
    'a score of 101': (p) => ((p.days[0].activities[0].score = 101), p),
    'a fractional score': (p) => ((p.days[0].activities[0].score = 89.5), p),
    'a label that disagrees': (p) => ((p.days[0].activities[0].suitability = 'Poor'), p),
    'an empty reasoning': (p) => ((p.days[0].activities[0].reasoning = '  '), p),
    'a Mars/Olympus location timezone': (p) => ((p.location.timezone = 'Mars/Olympus'), p),
    'a whitespace-only location name': (p) => ((p.location.name = '   '), p),
  },
  'location search': {
    'a numeric id': (p) => ((p.results[0].id = 2643743), p),
    'a whitespace-only result name': (p) => ((p.results[0].name = '   '), p),
    'the same location twice': (p) => (p.results.push({ ...p.results[0] }), p),
  },
  error: {
    'a Mars/Olympus candidate timezone': (p) => ((p.error.candidates[1].timezone = 'Mars/Olympus'), p),
    'an unknown error code': (p) => ((p.error.code = 'OOPS'), p),
    'a single ambiguity candidate': (p) => (p.error.candidates.pop(), p),
    'the same candidate twice': (p) => ((p.error.candidates[1] = { ...p.error.candidates[0] }), p),
    'candidates on a non-ambiguity error': (p) => ((p.error.code = 'LOCATION_NOT_FOUND'), p),
  },
};

export const REFERENCE = {
  ranking: referenceRanking,
  'location search': referenceSearch,
  error: referenceError,
} as const;
