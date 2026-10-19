/**
 * The API contract this suite is written against. No implementation exists yet,
 * so these types ARE the specification. Responses are validated at runtime against
 * docs/openapi.yaml, the machine-readable contract; keep the two in step.
 */

export const ACTIVITIES = ['Skiing', 'Surfing', 'Outdoor Sightseeing', 'Indoor Sightseeing'] as const;
export type Activity = (typeof ACTIVITIES)[number];

/** GET /api/v1/locations?query={text} */
export interface Location {
  id: string; // stable id, e.g. Open-Meteo geocoding id
  name: string;
  country: string;
  countryCode: string;
  region?: string; // admin1
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface LocationSearchResponse {
  query: string;
  results: Location[];
}

/** GET /api/v1/rankings?locationId={id}  |  GET /api/v1/rankings?city={name} */
export interface ActivityRanking {
  activity: Activity;
  rank: number; // 1 = best for that day, 4 = worst; unique per day
  score: number; // integer 0..100, the "measure of suitability"
  suitability: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Unsuitable';
  reasoning: string; // human-readable, e.g. "High snowfall expected"
}

export interface DayRanking {
  date: string; // ISO yyyy-mm-dd, in the location's local time zone
  activities: ActivityRanking[]; // sorted by rank ascending
}

export interface RankingResponse {
  location: Location;
  days: DayRanking[]; // exactly 7, consecutive, ascending
}

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'LOCATION_NOT_FOUND',
  'AMBIGUOUS_LOCATION',
  'UPSTREAM_UNAVAILABLE',
  'UPSTREAM_TIMEOUT',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    candidates?: Location[]; // present for AMBIGUOUS_LOCATION
  };
}

/** Score bands that map score -> suitability label. */
export const SUITABILITY_BANDS: ReadonlyArray<{ min: number; label: ActivityRanking['suitability'] }> = [
  { min: 80, label: 'Excellent' },
  { min: 60, label: 'Good' },
  { min: 40, label: 'Fair' },
  { min: 20, label: 'Poor' },
  { min: 0, label: 'Unsuitable' },
];

/** The label for a score's band; `undefined` when the score is not an integer in 0..100. */
export function expectedSuitability(score: number): ActivityRanking['suitability'] | undefined {
  if (!Number.isInteger(score) || score < 0 || score > 100) return undefined;
  return SUITABILITY_BANDS.find((b) => score >= b.min)?.label;
}
