import assert from 'node:assert/strict';
import { Then } from '@cucumber/cucumber';
import { assertError, assertValidResponse } from '../../src/assertions/responses';
import { ActivityWorld } from '../support/world';

Then('I receive a valid location search response', function (this: ActivityWorld) {
  assertValidResponse(this.response, 200, 'location search');
});

Then('I receive a valid ranking response', function (this: ActivityWorld) {
  assertValidResponse(this.response, 200, 'ranking');
});

Then('I receive a valid response with status {int}', function (this: ActivityWorld, status: number) {
  const kind = status >= 400 ? 'error' : this.lastEndpoint;
  assert.ok(kind, 'no action has been performed');
  assertValidResponse(this.response, status, kind);
});

Then('I receive a {int} {string} error', function (this: ActivityWorld, status: number, code: string) {
  assertError(this.response, status, code);
});

Then('the response is received within {int} ms', function (this: ActivityWorld, ms: number) {
  assert.ok(this.response, 'No response captured');
  assert.ok(this.response.durationMs <= ms, `took ${this.response.durationMs} ms, budget ${ms} ms`);
});

Then('the error message is human readable', function (this: ActivityWorld) {
  const message = this.body.error?.message;
  assert.equal(typeof message, 'string');
  assert.ok(message.trim().length > 0, 'error message must not be empty');
  assert.doesNotMatch(
    message,
    /\n\s+at |undefined|null|\[object Object\]/,
    'no stack traces or leaked internals',
  );
});

// ---------- upstream interactions (only meaningful after a validated response) ----------

function requireResponse(world: ActivityWorld): void {
  assert.ok(world.response, 'an action must run before asserting on upstream calls');
}

Then('the Open-Meteo forecast was not called', function (this: ActivityWorld) {
  requireResponse(this);
  assert.equal(this.stub.requestsTo('forecast').length, 0);
});

Then('Open-Meteo geocoding was not called', function (this: ActivityWorld) {
  requireResponse(this);
  assert.equal(this.stub.requestsTo('geocoding').length, 0);
});

Then('Open-Meteo was not called at all', function (this: ActivityWorld) {
  requireResponse(this);
  assert.deepEqual(
    this.stub.requests.map((r) => r.route),
    [],
  );
});

Then('the Open-Meteo forecast was called exactly once', function (this: ActivityWorld) {
  requireResponse(this);
  assert.equal(this.stub.requestsTo('forecast').length, 1);
});

Then('no forecast was requested before a location was selected', function (this: ActivityWorld) {
  assert.ok(
    this.forecastCallsAfterAction.length >= 2,
    'expected an ambiguous request followed by a selection',
  );
  assert.equal(
    this.forecastCallsAfterAction[0],
    0,
    'the forecast was fetched before the user chose a location',
  );
});
