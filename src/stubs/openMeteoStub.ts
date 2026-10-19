import http from 'node:http';
import { AddressInfo } from 'node:net';

/**
 * A tiny, dependency-free HTTP stub that impersonates the three Open-Meteo endpoints the
 * Activity Ranking API depends on:
 *   - Geocoding search:  GET /v1/search?name=...&count=...
 *   - Geocoding lookup:  GET /v1/get?id=...   (resolve a locationId)
 *   - Forecast:          GET /v1/forecast?latitude=...&longitude=...
 *
 * Why a real HTTP server rather than in-process mocking (nock)? The SUT runs in a separate
 * process, so in-process interception can't reach it. The SUT is configured (contract
 * assumption) via OPEN_METEO_GEOCODING_BASE_URL / OPEN_METEO_FORECAST_BASE_URL to call this stub.
 *
 * Resolution order per request (documented and covered by @harness scenarios):
 *   1. an explicit override for the route (`given`) always wins: used for fault injection;
 *   2. otherwise the route's realistic default:
 *        search   -> the documented Open-Meteo matching rules
 *                    (https://open-meteo.com/en/docs/geocoding-api, checked 2026-10-19):
 *                    empty or 1-character names match nothing; 2 characters match an exact
 *                    name; 3+ characters use normalised (case- and diacritic-insensitive)
 *                    prefix matching; an optional ", <country|country code|admin1>" qualifier
 *                    must match exactly; `count` defaults to 10 and must be 1..100 (else 400);
 *                    "results" is omitted when nothing matches;
 *        lookup   -> the place with that id, or 404;
 *        forecast -> the forecast registered for those coordinates, or 500 "not primed".
 */

export type StubRoute = 'geocoding' | 'lookup' | 'forecast';

export interface StubResponse {
  status: number;
  body?: unknown;
  delayMs?: number;
  /** Send this exact text instead of JSON-encoding `body` (e.g. malformed JSON or HTML). */
  raw?: string;
  contentType?: string;
}

export interface RecordedRequest {
  route: StubRoute;
  path: string;
  query: URLSearchParams;
  at: number;
}

const ROUTES: Record<string, StubRoute> = {
  '/v1/search': 'geocoding',
  '/v1/get': 'lookup',
  '/v1/forecast': 'forecast',
};

export interface GazetteerEntry {
  name: string;
  country?: string;
  country_code?: string;
  admin1?: string;
}

export const OPEN_METEO_DEFAULT_COUNT = 10;
const OPEN_METEO_MAX_COUNT = 100;

export class OpenMeteoStub {
  private server?: http.Server;
  private overrides = new Map<StubRoute, StubResponse>();
  private forecastByCoords = new Map<string, StubResponse>();
  private lookup = new Map<string, unknown>();
  private gazetteer: GazetteerEntry[] = [];
  readonly requests: RecordedRequest[] = [];

  constructor(private readonly port: number) {}

  get baseUrl(): string {
    const addr = this.server?.address() as AddressInfo | undefined;
    return `http://127.0.0.1:${addr?.port ?? this.port}`;
  }

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => this.handle(req, res));
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.port, '127.0.0.1', () => resolve());
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = undefined;
  }

  /** Forget every primed response and recorded request. Called before each scenario. */
  reset(): void {
    this.overrides.clear();
    this.forecastByCoords.clear();
    this.lookup.clear();
    this.gazetteer = [];
    this.requests.length = 0;
  }

  /** Force a response for a route, taking precedence over its default behaviour. */
  given(route: StubRoute, response: StubResponse): void {
    this.overrides.set(route, response);
  }

  /** Register a forecast for specific coordinates (used for multi-location scenarios). */
  givenForecastFor(latitude: number, longitude: number, response: StubResponse): void {
    this.forecastByCoords.set(coordKey(latitude, longitude), response);
  }

  /** Places served by /v1/search. */
  setGazetteer(places: GazetteerEntry[]): void {
    this.gazetteer = [...places];
  }

  /** Places resolvable by id through /v1/get. Unknown ids get a 404. */
  setLookup(places: Array<{ id: number }>): void {
    this.lookup.clear();
    places.forEach((p) => this.lookup.set(String(p.id), p));
  }

  requestsTo(route: StubRoute): RecordedRequest[] {
    return this.requests.filter((r) => r.route === route);
  }

  private resolve(route: StubRoute, q: URLSearchParams): StubResponse {
    const override = this.overrides.get(route);
    if (override) return override;
    switch (route) {
      case 'geocoding': {
        const rawCount = q.get('count');
        const count = rawCount === null ? OPEN_METEO_DEFAULT_COUNT : Number(rawCount);
        if (!Number.isInteger(count) || count < 1 || count > OPEN_METEO_MAX_COUNT)
          return { status: 400, body: { error: true, reason: 'Parameter count must be between 1 and 100.' } };
        const results = this.gazetteer
          .filter((p) => matchesOpenMeteoSearch(p, q.get('name') ?? ''))
          .slice(0, count);
        return {
          status: 200,
          body: results.length ? { results, generationtime_ms: 0.5 } : { generationtime_ms: 0.5 },
        };
      }
      case 'lookup': {
        const found = this.lookup.get(q.get('id') ?? '');
        return found
          ? { status: 200, body: found }
          : { status: 404, body: { error: true, reason: 'Not found' } };
      }
      case 'forecast': {
        const key = coordKey(Number(q.get('latitude')), Number(q.get('longitude')));
        return (
          this.forecastByCoords.get(key) ?? {
            status: 500,
            body: { error: true, reason: `Stub has no forecast primed for ${key}` },
          }
        );
      }
    }
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url ?? '/', this.baseUrl);
    const route = ROUTES[url.pathname];
    if (!route) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: true, reason: `Stub has no route for ${url.pathname}` }));
      return;
    }
    this.requests.push({ route, path: url.pathname, query: url.searchParams, at: Date.now() });
    const response = this.resolve(route, url.searchParams);
    const send = () => {
      if (res.destroyed) return;
      res.writeHead(response.status, { 'Content-Type': response.contentType ?? 'application/json' });
      res.end(response.raw ?? JSON.stringify(response.body ?? null));
    };
    if (response.delayMs) setTimeout(send, response.delayMs);
    else send();
  }
}

function coordKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

function normalise(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Open-Meteo geocoding name matching (see the class comment for the documented rules). */
export function matchesOpenMeteoSearch(place: GazetteerEntry, rawName: string): boolean {
  const [term, qualifier] = rawName.split(',').map((part) => normalise(part));
  if (term.length < 2) return false;
  const name = normalise(place.name);
  const nameMatches = term.length === 2 ? name === term : name.startsWith(term);
  if (!nameMatches) return false;
  if (qualifier === undefined || qualifier === '') return true;
  return [place.country, place.country_code, place.admin1].some(
    (v) => v !== undefined && normalise(v) === qualifier,
  );
}
