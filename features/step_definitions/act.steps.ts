import assert from 'node:assert/strict';
import { DataTable, When } from '@cucumber/cucumber';
import { jsonObjectBody } from '../../src/assertions/responses';
import { Location } from '../../src/contract';
import { place } from '../../src/fixtures/weather';
import { ActivityWorld } from '../support/world';

When('I search for locations matching {string}', async function (this: ActivityWorld, query: string) {
  await this.act('location search', () => this.api.searchLocations(query));
});

When(
  'I search for locations matching a {int}-character name',
  async function (this: ActivityWorld, length: number) {
    await this.act('location search', () => this.api.searchLocations('a'.repeat(length)));
  },
);

When('I search for locations without a query', async function (this: ActivityWorld) {
  await this.act('location search', () => this.api.searchLocations(undefined));
});

When('I request rankings for location {string}', async function (this: ActivityWorld, placeKey: string) {
  await this.act('ranking', () => this.api.getRankings({ locationId: String(place(placeKey).id) }));
});

When(
  'I request rankings for location {string} twice',
  async function (this: ActivityWorld, placeKey: string) {
    const params = { locationId: String(place(placeKey).id) };
    await this.act('ranking', () => this.api.getRankings(params));
    await this.act('ranking', () => this.api.getRankings(params));
  },
);

When('I request rankings for the city {string}', async function (this: ActivityWorld, city: string) {
  await this.act('ranking', () => this.api.getRankings({ city }));
});

When('I request rankings with query parameters:', async function (this: ActivityWorld, table: DataTable) {
  await this.act('ranking', () => this.api.getRankings(table.rowsHash()));
});

When('I request rankings with no parameters', async function (this: ActivityWorld) {
  await this.act('ranking', () => this.api.getRankings({}));
});

// ---------- selection flow: IDs always come from a previous RESPONSE, never from fixtures ----------

function pick(list: unknown, where: string, source: string): Location {
  assert.ok(Array.isArray(list), `${source} is not a list`);
  const matches = (list as Location[]).filter((l) => l.region === where || l.country === where);
  assert.equal(
    matches.length,
    1,
    `expected exactly one ${source} entry in "${where}", got ${matches.length}`,
  );
  assert.ok(matches[0].id, `${source} entry in "${where}" has no id`);
  return matches[0];
}

When('I select the search result in {string}', function (this: ActivityWorld, where: string) {
  const body = jsonObjectBody(this.response);
  assert.equal(this.response?.status, 200, '[STATUS_MISMATCH] cannot select: the search did not succeed');
  this.selectedLocationId = pick(body.results, where, 'search result').id;
});

When(
  'I choose the candidate in {string} from the ambiguity error',
  function (this: ActivityWorld, where: string) {
    const body = jsonObjectBody(this.response);
    assert.equal(
      this.response?.status,
      409,
      '[STATUS_MISMATCH] cannot choose: the response was not an ambiguity error',
    );
    const error = body.error as { candidates?: unknown };
    this.selectedLocationId = pick(error?.candidates, where, 'candidate').id;
  },
);

When('I request rankings for the selected location', async function (this: ActivityWorld) {
  assert.ok(this.selectedLocationId, 'no location has been selected');
  const locationId = this.selectedLocationId;
  await this.act('ranking', () => this.api.getRankings({ locationId }));
});
