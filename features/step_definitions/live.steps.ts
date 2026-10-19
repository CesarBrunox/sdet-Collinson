import assert from 'node:assert/strict';
import { Then, When } from '@cucumber/cucumber';
import { addDays, forecastPayload, place, profile } from '../../src/fixtures/weather';
import { localDate } from '../../src/time/clock';
import { isRealCalendarDate } from '../../src/validation/contractValidators';
import { ActivityWorld } from '../support/world';

const GEO = process.env.LIVE_OPEN_METEO_GEOCODING_BASE_URL ?? 'https://geocoding-api.open-meteo.com';
const FC = process.env.LIVE_OPEN_METEO_FORECAST_BASE_URL ?? 'https://api.open-meteo.com';

// Daily variables the stub serves, derived from the fixture builder so drift is detected.
const STUB_DAILY = Object.keys(
  forecastPayload([profile('clear and mild')], {
    startDate: '2026-01-01',
    latitude: 0,
    longitude: 0,
    timezone: 'UTC',
  }).daily,
).filter((k) => k !== 'time');

async function live(world: ActivityWorld, url: URL): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const raw = await res.text();
  world.harnessResult = { status: res.status, body: JSON.parse(raw), raw, durationMs: 0 };
}

When('I call the live geocoding search for {string}', async function (this: ActivityWorld, name: string) {
  await live(this, new URL(`/v1/search?${new URLSearchParams({ name, count: '10' })}`, GEO));
});

When(
  'I call the live geocoding search for {string} with count {string}',
  async function (this: ActivityWorld, name: string, count: string) {
    await live(this, new URL(`/v1/search?${new URLSearchParams({ name, count })}`, GEO));
  },
);

When('I call the live location lookup for id {string}', async function (this: ActivityWorld, id: string) {
  await live(this, new URL(`/v1/get?id=${id}`, GEO));
});

When(
  "I call the live forecast for {string} with the stub's daily variables",
  async function (this: ActivityWorld, key: string) {
    const p = place(key);
    const q = new URLSearchParams({
      latitude: String(p.latitude),
      longitude: String(p.longitude),
      daily: STUB_DAILY.join(','),
      forecast_days: '7',
      timezone: p.timezone,
    });
    await live(this, new URL(`/v1/forecast?${q}`, FC));
  },
);

Then('the live response has status {int}', function (this: ActivityWorld, status: number) {
  assert.equal(this.harnessResult?.status, status, (this.harnessResult?.raw ?? '').slice(0, 300));
});

Then(
  'every live geocoding result has the fields id, name, latitude, longitude, country, country_code, timezone',
  function (this: ActivityWorld) {
    const results = this.harnessResult?.body.results as Record<string, unknown>[];
    assert.ok(Array.isArray(results) && results.length > 0);
    for (const r of results)
      for (const f of ['id', 'name', 'latitude', 'longitude', 'country', 'country_code', 'timezone'])
        assert.ok(f in r, `live result ${String(r.name)} lacks ${f}`);
  },
);

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

Then(
  'the live geocoding results satisfy the {string} rule for {string}',
  function (this: ActivityWorld, rule: string, name: string) {
    const names = ((this.harnessResult?.body.results ?? []) as Array<{ name: string }>).map((r) =>
      norm(r.name),
    );
    if (rule === 'no results') return assert.deepEqual(names, []);
    // The real service also matches alternate/localised names (e.g. "Lon" -> "Tanga"), so only
    // the best (first) result is required to follow the primary-name rule the stub models.
    assert.ok(names.length > 0, `no live results for "${name}"`);
    if (rule === 'exact name') assert.equal(names[0], norm(name));
    else assert.ok(names[0].startsWith(norm(name)), `"${names[0]}" does not start with "${name}"`);
  },
);

Then('the live lookup result is named {string}', function (this: ActivityWorld, name: string) {
  assert.equal(this.harnessResult?.body.name, name);
});

Then(
  'the live forecast has 7 consecutive real dates starting on the local today in {string}',
  function (this: ActivityWorld, tz: string) {
    const time = this.harnessResult?.body.daily.time as string[];
    assert.equal(time.length, 7);
    time.forEach((d) => assert.ok(isRealCalendarDate(d), d));
    time.slice(1).forEach((d, i) => assert.equal(d, addDays(time[i], 1)));
    const today = localDate(new Date(), tz);
    // Allow a one-day skew around local midnight / provider cache updates.
    assert.ok(
      [today, addDays(today, -1), addDays(today, 1)].includes(time[0]),
      `day 1 ${time[0]} vs local today ${today}`,
    );
  },
);

Then('every live daily array the stub serves has 7 values', function (this: ActivityWorld) {
  const daily = this.harnessResult?.body.daily as Record<string, unknown[]>;
  for (const v of STUB_DAILY) {
    assert.ok(Array.isArray(daily[v]), `live forecast lacks daily "${v}"`);
    assert.equal(daily[v].length, 7, v);
  }
});
