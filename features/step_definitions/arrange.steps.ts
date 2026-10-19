import { DataTable, Given } from '@cucumber/cucumber';
import { addDays, OPTIONAL_FORECAST_FIELDS, PLACES, SPRINGFIELD_KEYS } from '../../src/fixtures/weather';
import { StubRoute } from '../../src/stubs/openMeteoStub';
import { ActivityWorld } from '../support/world';

type Daily = Record<string, unknown[]>;

// ---------- geocoding ----------

Given('Open-Meteo geocoding knows the following places:', function (this: ActivityWorld, table: DataTable) {
  table.hashes().forEach((row) => this.addKnownPlace(row.place));
});

Given(
  'Open-Meteo geocoding knows {int} towns named {string}',
  function (this: ActivityWorld, count: number, name: string) {
    const keys = Object.keys(PLACES).filter((k) => k.startsWith(`${name}, `));
    if (name !== 'Springfield' || keys.length !== count || count !== SPRINGFIELD_KEYS.length)
      throw new Error(`Fixture has ${keys.length} towns named "${name}", scenario expects ${count}`);
    SPRINGFIELD_KEYS.forEach((k) => this.addKnownPlace(k));
  },
);

Given('Open-Meteo geocoding finds no places', function (this: ActivityWorld) {
  this.knownPlaces = [];
});

// ---------- forecast content ----------

Given(
  'the forecast for {string} is {string} every day',
  function (this: ActivityWorld, placeKey: string, weather: string) {
    this.setForecast(placeKey, Array(7).fill(weather));
  },
);

Given(
  'the 7-day forecast for {string} is:',
  function (this: ActivityWorld, placeKey: string, table: DataTable) {
    const profiles: string[] = [];
    table.hashes().forEach((row) => (profiles[Number(row.day) - 1] = row.weather));
    this.setForecast(placeKey, profiles);
  },
);

Given(
  'on day {int} the forecast {string} is {float}',
  function (this: ActivityWorld, day: number, field: string, value: number) {
    this.overrideDay(day, field, value);
  },
);

Given("the provider's forecast starts on {string}", function (this: ActivityWorld, date: string) {
  // Applied when the stub is primed, so it also affects forecasts defined in a Background.
  this.forecastStartDate = date;
});

// ---------- generic fault injection (any upstream) ----------

Given(
  'the Open-Meteo {upstream} responds with status {int}',
  function (this: ActivityWorld, route: StubRoute, status: number) {
    this.override(route, { status, body: { error: true, reason: 'Simulated upstream failure' } });
  },
);

Given(
  'the Open-Meteo {upstream} responds with malformed JSON',
  function (this: ActivityWorld, route: StubRoute) {
    this.override(route, { status: 200, raw: '{"results": [{"id": 1, "name": "Lond' });
  },
);

Given(
  'the Open-Meteo {upstream} takes {int} ms to respond',
  function (this: ActivityWorld, route: StubRoute, delayMs: number) {
    // The delayed response is otherwise valid, so only the timing can make the scenario fail.
    const body =
      route === 'forecast'
        ? this.baseForecastBody()
        : route === 'lookup'
          ? this.knownPlaces[0]
          : { results: this.knownPlaces, generationtime_ms: 0.5 };
    this.override(route, { status: 200, body, delayMs });
  },
);

// ---------- incomplete / inconsistent forecast shapes ----------

function mutateForecast(world: ActivityWorld, mutate: (daily: Daily) => void): void {
  const body = world.baseForecastBody();
  mutate(body.daily as unknown as Daily);
  world.override('forecast', { status: 200, body });
}

Given('the Open-Meteo forecast returns only {int} days', function (this: ActivityWorld, days: number) {
  mutateForecast(this, (d) => Object.keys(d).forEach((k) => (d[k] = d[k].slice(0, days))));
});

Given('the Open-Meteo forecast has null values on day {int}', function (this: ActivityWorld, day: number) {
  mutateForecast(this, (d) =>
    Object.keys(d)
      .filter((k) => k !== 'time')
      .forEach((k) => (d[k][day - 1] = null)),
  );
});

Given(
  'the Open-Meteo forecast has a null {string} value on day {int}',
  function (this: ActivityWorld, field: string, day: number) {
    mutateForecast(this, (d) => (d[field][day - 1] = null));
  },
);

Given(
  /^the Open-Meteo forecast is missing the (optional )?"([a-z0-9_]+)" array$/,
  function (this: ActivityWorld, optional: string | undefined, field: string) {
    if (optional && !(OPTIONAL_FORECAST_FIELDS as readonly string[]).includes(field))
      throw new Error(`"${field}" is not a declared optional field (${OPTIONAL_FORECAST_FIELDS.join(', ')})`);
    if (field === 'daily_units') {
      const body = this.baseForecastBody() as Record<string, unknown>;
      delete body.daily_units;
      this.override('forecast', { status: 200, body });
      return;
    }
    mutateForecast(this, (d) => delete d[field]);
  },
);

Given('the Open-Meteo forecast is missing every optional field', function (this: ActivityWorld) {
  const body = this.baseForecastBody() as Record<string, unknown> & { daily: Daily };
  for (const f of OPTIONAL_FORECAST_FIELDS) {
    if (f === 'daily_units') delete body.daily_units;
    else delete body.daily[f];
  }
  this.override('forecast', { status: 200, body });
});

Given(
  'the Open-Meteo forecast has a {string} array with {int} values',
  function (this: ActivityWorld, field: string, n: number) {
    mutateForecast(this, (d) => (d[field] = d[field].slice(0, n)));
  },
);

Given(
  'the Open-Meteo forecast has a duplicated date on day {int}',
  function (this: ActivityWorld, day: number) {
    mutateForecast(this, (d) => (d.time[day - 1] = d.time[day - 2]));
  },
);

Given(
  'the Open-Meteo forecast has a gap in its dates after day {int}',
  function (this: ActivityWorld, day: number) {
    mutateForecast(this, (d) => {
      for (let i = day; i < d.time.length; i++) d.time[i] = addDays(String(d.time[i]), 1);
    });
  },
);
