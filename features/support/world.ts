import { IWorldOptions, setWorldConstructor, World } from '@cucumber/cucumber';
import { jsonObjectBody } from '../../src/assertions/responses';
import { ActivityRankingClient, ApiResponse } from '../../src/client/apiClient';
import {
  applyOverride,
  DayWeather,
  forecastPayload,
  GeoPlace,
  place,
  profile,
} from '../../src/fixtures/weather';
import { OpenMeteoStub, StubResponse, StubRoute } from '../../src/stubs/openMeteoStub';
import { horizonFor } from '../../src/time/clock';
import { stub } from './hooks';

const DEFAULT_PROFILE = 'calm and overcast';

interface PendingForecast {
  place: GeoPlace;
  days: DayWeather[];
}

/**
 * Per-scenario state.
 *
 * Arrange steps describe the world declaratively. The stub is primed ONCE, lazily, right
 * before the first action of the scenario (`ensurePrimed`). Later actions in the same
 * scenario (search -> select -> rank) reuse the same primed responses and keep the full
 * request history, so multi-step flows can assert on every upstream interaction.
 */
export class ActivityWorld extends World {
  readonly api = new ActivityRankingClient();
  readonly stub: OpenMeteoStub = stub;

  knownPlaces: GeoPlace[] = [];
  forecasts = new Map<string, PendingForecast>();
  /**
   * Provider start date override (calendar-boundary scenarios). When unset, the stub answers
   * like Open-Meteo would at REFERENCE_NOW: day 1 = the location's local date at that instant.
   */
  forecastStartDate?: string;
  overrides = new Map<StubRoute, StubResponse>();
  private primed = false;

  response?: ApiResponse;
  responses: ApiResponse[] = [];
  /** Number of forecast requests the stub had seen after each action, in order. */
  forecastCallsAfterAction: number[] = [];
  selectedLocationId?: string;
  /** Which endpoint the last action called, so status-driven steps pick the right validator. */
  lastEndpoint?: 'location search' | 'ranking';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw stub JSON, shape asserted in steps
  harnessResult?: { status: number; body: any; raw: string; durationMs: number };

  constructor(options: IWorldOptions) {
    super(options);
  }

  addKnownPlace(key: string): GeoPlace {
    this.assertNotPrimed('add a known place');
    const p = place(key);
    if (!this.knownPlaces.some((k) => k.id === p.id)) this.knownPlaces.push(p);
    return p;
  }

  setForecast(placeKey: string, dayProfiles: string[]): void {
    this.assertNotPrimed('define a forecast');
    const p = place(placeKey);
    const days = Array.from({ length: 7 }, (_, i) => profile(dayProfiles[i] ?? DEFAULT_PROFILE));
    this.forecasts.set(placeKey, { place: p, days });
  }

  overrideDay(day: number, field: string, value: number): void {
    this.assertNotPrimed('override a forecast day');
    const last = [...this.forecasts.values()].at(-1);
    if (!last) throw new Error('Define a forecast before overriding a day');
    applyOverride(last.days[day - 1], field, value);
  }

  override(route: StubRoute, response: StubResponse): void {
    this.assertNotPrimed('inject an upstream response');
    this.overrides.set(route, response);
  }

  /** Prime the stub from the arranged world. Idempotent within a scenario. */
  ensurePrimed(): void {
    if (this.primed) return;
    this.primed = true;
    const lookup = new Map<number, GeoPlace>(this.knownPlaces.map((p) => [p.id, p]));
    for (const f of this.forecasts.values()) lookup.set(f.place.id, f.place);
    this.stub.setLookup([...lookup.values()]);
    this.stub.setGazetteer(this.knownPlaces);
    for (const f of this.forecasts.values())
      this.stub.givenForecastFor(f.place.latitude, f.place.longitude, {
        status: 200,
        body: this.forecastBodyFor(f),
      });
    for (const [route, response] of this.overrides) this.stub.given(route, response);
  }

  /** Run one action against the SUT, recording its response and the upstream state after it. */
  async act(
    endpoint: 'location search' | 'ranking',
    action: () => Promise<ApiResponse>,
  ): Promise<ApiResponse> {
    this.ensurePrimed();
    this.lastEndpoint = endpoint;
    const res = await action();
    this.response = res;
    this.responses.push(res);
    this.forecastCallsAfterAction.push(this.stub.requestsTo('forecast').length);
    return res;
  }

  private forecastBodyFor(f: PendingForecast) {
    return forecastPayload(f.days, {
      startDate: this.startDateFor(f.place.timezone),
      latitude: f.place.latitude,
      longitude: f.place.longitude,
      timezone: f.place.timezone,
    });
  }

  /** Day 1 the provider serves for a time zone (override, else local date at REFERENCE_NOW). */
  startDateFor(timeZone: string): string {
    return this.forecastStartDate ?? horizonFor(timeZone)[0];
  }

  /** The forecast body for the most recently defined place (base for malformed/partial variants). */
  baseForecastBody(): ReturnType<typeof forecastPayload> {
    const f = [...this.forecasts.values()].at(-1);
    if (!f) throw new Error('Define a forecast first');
    return this.forecastBodyFor(f);
  }

  private assertNotPrimed(what: string): void {
    if (this.primed)
      throw new Error(`Cannot ${what} after the first action: arrange everything in Given steps`);
  }

  /**
   * The last response body, guaranteed to be a parsed JSON object served as application/json.
   * HTML pages, empty bodies and malformed JSON fail here with a bounded excerpt, so no
   * assertion can be satisfied by an unrelated service.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shape is validated by the contract validators
  get body(): any {
    return jsonObjectBody(this.response);
  }
}

setWorldConstructor(ActivityWorld);
