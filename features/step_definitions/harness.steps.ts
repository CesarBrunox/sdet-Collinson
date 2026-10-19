import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { After, Given, Then, When } from '@cucumber/cucumber';
import { assertValidResponse, FAILURE } from '../../src/assertions/responses';
import { ActivityRankingClient, ApiResponse, SutTransportError } from '../../src/client/apiClient';
import { BROKEN, REFERENCE } from '../../src/fixtures/referencePayloads';
import { addDays, place } from '../../src/fixtures/weather';
import { ResponseKind, VALIDATORS } from '../../src/validation/contractValidators';
import { ActivityWorld } from '../support/world';

// ---------- direct calls to the Open-Meteo stub (never the SUT) ----------

async function callStub(world: ActivityWorld, path: string, params: Record<string, string>) {
  world.ensurePrimed();
  const url = new URL(path, world.stub.baseUrl);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const started = Date.now();
  const res = await fetch(url);
  const raw = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    body = undefined;
  }
  world.harnessResult = { status: res.status, body, raw, durationMs: Date.now() - started };
}

When(
  'the harness calls the stubbed geocoding search for {string}',
  async function (this: ActivityWorld, name: string) {
    await callStub(this, '/v1/search', { name });
  },
);

Then('the stub returns geocoding results named {string}', function (this: ActivityWorld, names: string) {
  const expected = names
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
  const results = (this.harnessResult?.body?.results ?? []) as Array<{ name: string }>;
  assert.equal(this.harnessResult?.status, 200);
  assert.deepEqual(
    results.map((r) => r.name),
    expected,
  );
});

When('the harness looks up the location id of {string}', async function (this: ActivityWorld, key: string) {
  await callStub(this, '/v1/get', { id: String(place(key).id) });
});

When('the harness looks up the location id {string}', async function (this: ActivityWorld, id: string) {
  await callStub(this, '/v1/get', { id });
});

When(
  'the harness calls the stubbed forecast for {string}',
  async function (this: ActivityWorld, key: string) {
    const p = place(key);
    await callStub(this, '/v1/forecast', {
      latitude: String(p.latitude),
      longitude: String(p.longitude),
      forecast_days: '7',
      timezone: p.timezone,
    });
  },
);

Then('the stub returns {int} geocoding results', function (this: ActivityWorld, n: number) {
  assert.equal(this.harnessResult?.body.results.length, n);
});

Then('the stub returns no {string} key', function (this: ActivityWorld, key: string) {
  assert.ok(!(key in this.harnessResult!.body));
});

Then('the stubbed lookup returned the place {string}', function (this: ActivityWorld, key: string) {
  assert.deepEqual(this.harnessResult?.body, place(key));
});

Then('the stubbed forecast has 7 consecutive days', function (this: ActivityWorld) {
  const tz = this.harnessResult?.body.timezone as string;
  const expected = Array.from({ length: 7 }, (_, i) => addDays(this.startDateFor(tz), i));
  assert.deepEqual(this.harnessResult?.body.daily.time, expected);
});

Then(
  'the stubbed forecast snowfall on day {int} is {float}',
  function (this: ActivityWorld, d: number, v: number) {
    assert.equal(this.harnessResult?.body.daily.snowfall_sum[d - 1], v);
  },
);

Then('the stub responded with status {int}', function (this: ActivityWorld, status: number) {
  assert.equal(this.harnessResult?.status, status);
});

Then('the stub responded with a body that is not valid JSON', function (this: ActivityWorld) {
  assert.equal(this.harnessResult?.body, undefined, `body parsed as JSON: ${this.harnessResult?.raw}`);
});

Then('the stub took at least {int} ms to respond', function (this: ActivityWorld, ms: number) {
  assert.ok(this.harnessResult!.durationMs >= ms - 5, `took ${this.harnessResult!.durationMs} ms`);
});

Then('the stub has no recorded requests', function (this: ActivityWorld) {
  assert.equal(this.stub.requests.length, 0);
});

Then('the stub serves no geocoding results for {string}', async function (this: ActivityWorld, name: string) {
  await callStub(this, '/v1/search', { name });
  assert.ok(!('results' in this.harnessResult!.body), 'a previous scenario leaked gazetteer entries');
});

Then('the stub has no forecast primed for {string}', async function (this: ActivityWorld, key: string) {
  const p = place(key);
  await callStub(this, '/v1/forecast', { latitude: String(p.latitude), longitude: String(p.longitude) });
  assert.equal(this.harnessResult?.status, 500, 'a previous scenario leaked a primed forecast');
});

// ---------- contract validators ----------

Then('the {string} validator accepts the reference payload', function (kind: ResponseKind) {
  assert.deepEqual(VALIDATORS[kind](REFERENCE[kind]()), []);
});

Then(
  /^a "(ranking|location search|error)" response with (.+) fails as a contract violation mentioning "(.+)"$/,
  function (kind: ResponseKind, defect: string, expected: string) {
    const mutate = BROKEN[kind][defect];
    assert.ok(mutate, `unknown defect "${defect}"`);
    const body = mutate(REFERENCE[kind]());
    const res: ApiResponse = {
      status: 200,
      headers: new Headers(),
      body,
      rawBody: JSON.stringify(body),
      contentType: 'application/json',
      durationMs: 1,
    };
    assert.throws(
      () => assertValidResponse(res, 200, kind),
      (err: Error) => {
        assert.ok(err.message.startsWith(FAILURE.CONTRACT), `not a contract message: ${err.message}`);
        assert.ok(
          err.message.toLowerCase().includes(expected.toLowerCase()),
          `expected a problem mentioning "${expected}", got:\n${err.message}`,
        );
        return true;
      },
      `validator accepted a ${kind} payload with ${defect}`,
    );
  },
);

// ---------- stand-in services: prove success assertions reject non-contract responses ----------

const servers: http.Server[] = [];
After({ tags: '@harness' }, async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((r) => {
          s.closeAllConnections();
          s.close(() => r());
        }),
    ),
  );
});

async function listen(handler: http.RequestListener): Promise<string> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

let standInUrl = '';
let standInError: Error | undefined;

Given('a stand-in service that answers every request with an HTML page', async function () {
  standInUrl = await listen((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><html><head><title>Some other app</title></head><body>Login</body></html>');
  });
});

Given('a stand-in service that answers every request with JSON {string}', async function (json: string) {
  standInUrl = await listen((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(json);
  });
});

When('the harness sends a ranking request to the stand-in service', async function () {
  standInError = undefined;
  const res = await new ActivityRankingClient(standInUrl, 2000).getRankings({ locationId: '2643743' });
  try {
    assertValidResponse(res, 200, 'ranking');
  } catch (err) {
    standInError = err as Error;
  }
});

Then('the success assertion fails with a message mentioning {string}', function (text: string) {
  assert.ok(standInError, 'the success assertion PASSED for a non-contract response');
  assert.ok(standInError.message.includes(text), standInError.message);
});

async function transportKind(baseUrl: string, timeoutMs: number): Promise<string> {
  try {
    await new ActivityRankingClient(baseUrl, timeoutMs).getRankings({ locationId: '1' });
    return 'NO_ERROR';
  } catch (err) {
    return err instanceof SutTransportError ? err.kind : `UNEXPECTED: ${String(err)}`;
  }
}

Then('a request to an unused local port fails as {string}', async function (kind: string) {
  const probe = http.createServer();
  await new Promise<void>((r) => probe.listen(0, '127.0.0.1', () => r()));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((r) => probe.close(() => r()));
  assert.equal(await transportKind(`http://127.0.0.1:${port}`, 2000), kind);
});

Then('a request to a server that never answers fails as {string}', async function (kind: string) {
  const url = await listen(() => {
    /* accept the connection, never respond */
  });
  assert.equal(await transportKind(url, 200), kind);
});

Then(
  'a request to a server that sends headers but stalls the body fails as {string}',
  async function (kind: string) {
    const url = await listen((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '1000' });
      res.write('{"days": ['); // headers + partial body flushed, then silence
    });
    assert.equal(await transportKind(url, 300), kind);
  },
);

Then(
  'a request to a server that drops the connection mid-body fails as {string}',
  async function (kind: string) {
    const url = await listen((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '1000' });
      res.write('{"days": [', () => res.destroy());
    });
    assert.equal(await transportKind(url, 2000), kind);
  },
);
