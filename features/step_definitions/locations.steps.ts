import assert from 'node:assert/strict';
import { DataTable, Then } from '@cucumber/cucumber';
import { Location } from '../../src/contract';
import { place, SPRINGFIELD_KEYS } from '../../src/fixtures/weather';
import { OPEN_METEO_DEFAULT_COUNT } from '../../src/stubs/openMeteoStub';
import { ActivityWorld } from '../support/world';

function results(world: ActivityWorld): Location[] {
  const r = world.body.results;
  assert.ok(Array.isArray(r), '"results" must be an array');
  return r;
}

const summary = (l: Location) => ({ name: l.name, country: l.country, region: l.region });

Then('the location results contain, in order:', function (this: ActivityWorld, table: DataTable) {
  assert.deepEqual(results(this).map(summary), table.hashes());
});

Then(
  'every location result has an id, name, country, coordinates and timezone',
  function (this: ActivityWorld) {
    const r = results(this);
    assert.ok(r.length > 0, 'expected at least one result');
    for (const loc of r) {
      assert.equal(typeof loc.id, 'string', 'id is a string');
      assert.ok(loc.name && loc.country && loc.countryCode, `incomplete location ${JSON.stringify(loc)}`);
      assert.equal(typeof loc.latitude, 'number');
      assert.equal(typeof loc.longitude, 'number');
      assert.ok(loc.timezone, 'timezone present');
    }
  },
);

Then('results with the same name differ by country or region', function (this: ActivityWorld) {
  const r = results(this);
  const labels = r.map((l) => `${l.name}|${l.country}|${l.region ?? ''}`);
  assert.ok(r.length >= 2, 'expected at least two same-name results');
  assert.equal(new Set(labels).size, labels.length, `indistinguishable results: ${labels.join(', ')}`);
  assert.equal(new Set(r.map((l) => l.id)).size, r.length, 'ids must be unique');
});

Then(
  'the location results are the first {int} {string} towns in provider order',
  function (this: ActivityWorld, n: number, name: string) {
    assert.equal(name, 'Springfield');
    const expected = SPRINGFIELD_KEYS.slice(0, n).map((k) => String(place(k).id));
    assert.deepEqual(
      results(this).map((l) => l.id),
      expected,
    );
  },
);

Then(
  'Open-Meteo geocoding was asked for at most {int} results or the response was truncated to {int}',
  function (this: ActivityWorld, max: number, truncated: number) {
    // The cap may be enforced upstream (count <= 10; Open-Meteo defaults to 10) or by
    // truncating a larger upstream page. Either is acceptable; the user-visible list is what counts.
    const reqs = this.stub.requestsTo('geocoding');
    assert.equal(reqs.length, 1);
    const count = Number(reqs[0].query.get('count') ?? OPEN_METEO_DEFAULT_COUNT);
    assert.ok(count <= max || results(this).length === truncated, `count=${count} and results not truncated`);
  },
);

Then('the location results are empty', function (this: ActivityWorld) {
  assert.deepEqual(results(this), []);
});

Then('the first location result is named {string}', function (this: ActivityWorld, name: string) {
  assert.equal(results(this)[0]?.name, name);
});

Then('Open-Meteo geocoding was asked for the name {string}', function (this: ActivityWorld, name: string) {
  const reqs = this.stub.requestsTo('geocoding');
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0].query.get('name'), name);
});

Then('the response echoes the query {string}', function (this: ActivityWorld, query: string) {
  assert.equal(this.body.query, query);
});

Then('the error lists these candidate locations:', function (this: ActivityWorld, table: DataTable) {
  const candidates = this.body.error?.candidates as Location[];
  assert.ok(Array.isArray(candidates), 'error.candidates must be an array');
  assert.deepEqual(candidates.map(summary), table.hashes());
  assert.equal(new Set(candidates.map((c) => c.id)).size, candidates.length, 'candidate ids must be unique');
});

Then('the location result names are {string}', function (this: ActivityWorld, names: string) {
  const expected = names
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
  assert.deepEqual(
    results(this).map((l) => l.name),
    expected,
  );
});

Then('the first location result has no {string} field', function (this: ActivityWorld, field: string) {
  const first = results(this)[0] as unknown as Record<string, unknown>;
  assert.ok(first, 'expected at least one result');
  assert.ok(!(field in first), `"${field}" should be omitted, got ${JSON.stringify(first[field])}`);
});
