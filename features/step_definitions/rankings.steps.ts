import assert from 'node:assert/strict';
import { DataTable, Then } from '@cucumber/cucumber';
import { activityOn, dayAt, describeDay, eachDay } from '../../src/assertions/ranking';
import { ACTIVITIES, expectedSuitability, RankingResponse } from '../../src/contract';
import { addDays, place } from '../../src/fixtures/weather';
import { assertValidResponse } from '../../src/assertions/responses';
import { horizonFor, referenceNow } from '../../src/time/clock';
import { ActivityWorld } from '../support/world';

const body = (w: ActivityWorld) => w.body as RankingResponse;

// ---------- structure ----------

Then('the response identifies the location {string}', function (this: ActivityWorld, placeKey: string) {
  const p = place(placeKey);
  const loc = body(this).location;
  assert.ok(loc, 'response.location is required');
  assert.equal(loc.id, String(p.id));
  assert.equal(loc.name, p.name);
  assert.equal(loc.country, p.country);
  assert.equal(loc.timezone, p.timezone);
  assert.ok(
    Math.abs(loc.latitude - p.latitude) < 0.01 && Math.abs(loc.longitude - p.longitude) < 0.01,
    'coordinates',
  );
});

Then('the response contains 7 consecutive days matching the forecast dates', function (this: ActivityWorld) {
  const dates = body(this).days?.map((d) => d.date);
  const start = this.startDateFor(body(this).location.timezone);
  const expected = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  assert.deepEqual(dates, expected);
});

Then(
  'the response days run from {string} to {string}',
  function (this: ActivityWorld, first: string, last: string) {
    const dates = body(this).days.map((d) => d.date);
    const expected = Array.from({ length: 7 }, (_, i) => addDays(first, i));
    assert.equal(expected[6], last, 'scenario dates must span 7 days');
    assert.deepEqual(dates, expected);
  },
);

Then('each day contains exactly these activities:', function (this: ActivityWorld, table: DataTable) {
  const expected = table
    .raw()
    .map((r) => r[0])
    .sort();
  assert.deepEqual([...expected], [...ACTIVITIES].sort(), 'feature table must match contract');
  for (const d of body(this).days) {
    assert.deepEqual(d.activities.map((a) => a.activity).sort(), expected, `day ${d.date}`);
  }
});

Then('each day ranks its activities 1 to 4 in descending score order', function (this: ActivityWorld) {
  for (const d of body(this).days) {
    assert.deepEqual(
      d.activities.map((a) => a.rank),
      [1, 2, 3, 4],
      `ranks not 1..4 in order: ${describeDay(d)}`,
    );
    const scores = d.activities.map((a) => a.score);
    assert.deepEqual(
      scores,
      [...scores].sort((a, b) => b - a),
      `not sorted by score: ${describeDay(d)}`,
    );
  }
});

Then(
  'every score is an integer between {int} and {int}',
  function (this: ActivityWorld, min: number, max: number) {
    for (const d of body(this).days)
      for (const a of d.activities) {
        assert.ok(Number.isInteger(a.score), `${d.date} ${a.activity} score ${a.score} not an integer`);
        assert.ok(a.score >= min && a.score <= max, `${d.date} ${a.activity} score ${a.score} out of range`);
      }
  },
);

Then('every suitability label matches its score band:', function (this: ActivityWorld, table: DataTable) {
  const bands = table.hashes().map((r) => ({ min: Number(r['min score']), label: r.label }));
  for (const d of body(this).days)
    for (const a of d.activities) {
      const label = bands.find((b) => a.score >= b.min)?.label;
      assert.equal(a.suitability, label, `${d.date} ${a.activity} score ${a.score}`);
    }
});

Then(
  'every activity has a non-empty reasoning of at most {int} characters',
  function (this: ActivityWorld, max: number) {
    for (const d of body(this).days)
      for (const a of d.activities) {
        assert.equal(typeof a.reasoning, 'string');
        assert.ok(a.reasoning.trim().length > 0, `${d.date} ${a.activity} has empty reasoning`);
        assert.ok(a.reasoning.length <= max, `${d.date} ${a.activity} reasoning too long`);
      }
  },
);

// ---------- upstream request expectations ----------

function forecastQuery(w: ActivityWorld): URLSearchParams {
  const reqs = w.stub.requestsTo('forecast');
  assert.ok(reqs.length > 0, 'the Open-Meteo forecast was never called');
  return reqs[0].query;
}

Then(
  'the forecast was requested for the coordinates of {string}',
  function (this: ActivityWorld, key: string) {
    const q = forecastQuery(this);
    const p = place(key);
    assert.ok(Math.abs(Number(q.get('latitude')) - p.latitude) < 0.01, `latitude ${q.get('latitude')}`);
    assert.ok(Math.abs(Number(q.get('longitude')) - p.longitude) < 0.01, `longitude ${q.get('longitude')}`);
  },
);

Then('the forecast was requested for {int} days', function (this: ActivityWorld, days: number) {
  const q = forecastQuery(this);
  if (q.has('forecast_days')) assert.equal(Number(q.get('forecast_days')), days);
  else {
    const start = q.get('start_date');
    assert.ok(start && q.get('end_date'), 'expected forecast_days or start_date/end_date');
    assert.equal(q.get('end_date'), addDays(start, days - 1));
  }
});

Then('the forecast was requested in the time zone of {string}', function (this: ActivityWorld, key: string) {
  const tz = forecastQuery(this).get('timezone');
  assert.ok(tz === 'auto' || tz === place(key).timezone, `timezone=${tz}`);
});

Then('the forecast request includes the daily variables:', function (this: ActivityWorld, table: DataTable) {
  const daily = (forecastQuery(this).get('daily') ?? '').split(',');
  for (const [v] of table.raw())
    assert.ok(daily.includes(v), `daily is missing "${v}" (got ${daily.join(',')})`);
});

// ---------- ranking behaviour ----------

Then(
  'on day {int} {string} is ranked {int}',
  function (this: ActivityWorld, day: number, act: string, rank: number) {
    assert.equal(activityOn(body(this), day, act).rank, rank, describeDay(dayAt(body(this), day)));
  },
);

Then('on every day {string} is ranked {int}', function (this: ActivityWorld, act: string, rank: number) {
  for (const day of eachDay(body(this)))
    assert.equal(activityOn(body(this), day, act).rank, rank, describeDay(dayAt(body(this), day)));
});

Then(
  'on day {int} {string} scores higher than {string}',
  function (this: ActivityWorld, day: number, better: string, worse: string) {
    const b = activityOn(body(this), day, better);
    const w = activityOn(body(this), day, worse);
    assert.ok(b.score > w.score, describeDay(dayAt(body(this), day)));
    assert.ok(b.rank < w.rank, 'rank must agree with score');
  },
);

Then(
  'on day {int} the {string} score is at least {int}',
  function (this: ActivityWorld, day: number, act: string, min: number) {
    const a = activityOn(body(this), day, act);
    assert.ok(a.score >= min, `${act} scored ${a.score}, expected >= ${min}. Reasoning: ${a.reasoning}`);
  },
);

Then(
  'on day {int} the {string} score is at most {int}',
  function (this: ActivityWorld, day: number, act: string, max: number) {
    const a = activityOn(body(this), day, act);
    assert.ok(a.score <= max, `${act} scored ${a.score}, expected <= ${max}. Reasoning: ${a.reasoning}`);
  },
);

Then(
  'on every day the {string} score is at least {int}',
  function (this: ActivityWorld, act: string, min: number) {
    for (const day of eachDay(body(this)))
      assert.ok(activityOn(body(this), day, act).score >= min, `day ${day}`);
  },
);

Then(
  'on day {int} the {string} suitability is {string}',
  function (this: ActivityWorld, day: number, act: string, label: string) {
    const a = activityOn(body(this), day, act);
    assert.equal(a.suitability, label, `${act} scored ${a.score} (${a.reasoning})`);
    assert.equal(expectedSuitability(a.score), label, 'label must agree with the score band');
  },
);

Then(
  'on day {int} the reasoning for {string} mentions {string}',
  function (this: ActivityWorld, day: number, act: string, text: string) {
    const a = activityOn(body(this), day, act);
    assert.ok(a.reasoning.toLowerCase().includes(text.toLowerCase()), `reasoning was: "${a.reasoning}"`);
  },
);

Then(
  'the {string} score does not increase across days {int} to {int}',
  function (this: ActivityWorld, act: string, from: number, to: number) {
    const scores: number[] = [];
    for (let d = from; d <= to; d++) scores.push(activityOn(body(this), d, act).score);
    scores.slice(1).forEach((s, i) => assert.ok(s <= scores[i], `scores ${scores.join(' -> ')} increased`));
  },
);

Then('the top-ranked activity per day is:', function (this: ActivityWorld, table: DataTable) {
  const rows = table.hashes();
  assert.ok(rows.length > 0 && 'reasoning mentions' in rows[0], 'table needs a "reasoning mentions" column');
  for (const row of rows) {
    const d = dayAt(body(this), Number(row.day));
    const top = d.activities.find((a) => a.rank === 1);
    assert.equal(top?.activity, row.activity, describeDay(d));
    const keyword = row['reasoning mentions'].trim();
    assert.ok(keyword, `day ${row.day}: "reasoning mentions" must not be empty`);
    assert.ok(
      top!.reasoning.toLowerCase().includes(keyword.toLowerCase()),
      `day ${row.day} (${d.date}): ${top!.activity} reasoning "${top!.reasoning}" does not mention "${keyword}"`,
    );
  }
});

Then('both ranking responses are valid and rank the activities identically', function (this: ActivityWorld) {
  assert.equal(this.responses.length, 2, 'expected two ranking requests');
  this.responses.forEach((r) => assertValidResponse(r, 200, 'ranking'));
  const [a, b] = this.responses.map((r) => (r.body as RankingResponse).days);
  assert.deepEqual(a, b);
});

Then(
  'any activities with equal scores on the same day are ordered alphabetically',
  function (this: ActivityWorld) {
    let ties = 0;
    for (const d of body(this).days)
      d.activities.slice(1).forEach((a, i) => {
        const prev = d.activities[i];
        if (prev.score !== a.score) return;
        ties++;
        assert.ok(prev.activity.localeCompare(a.activity) < 0, `tie not alphabetical: ${describeDay(d)}`);
      });
    // Honest evidence: record whether the tie-break was actually exercised in this run.
    this.attach(
      ties
        ? `Tie-break exercised: ${ties} tied pair(s) observed.`
        : 'Tie-break NOT exercised: no equal scores observed.',
      'text/plain',
    );
  },
);

// ---------- explicit time reference (clock contract) ----------

Then(
  "the days are the location's 7 local dates starting at the reference time",
  function (this: ActivityWorld) {
    const tz = body(this).location.timezone;
    assert.deepEqual(
      body(this).days.map((d) => d.date),
      horizonFor(tz),
      `horizon must start on the local date in ${tz} at REFERENCE_NOW=${referenceNow().toISOString()}`,
    );
  },
);

Then('the first day is {string}', function (this: ActivityWorld, date: string) {
  assert.equal(body(this).days[0].date, date);
});

Then('any explicit forecast date range matches the horizon', function (this: ActivityWorld) {
  const q = this.stub.requestsTo('forecast')[0]?.query;
  assert.ok(q, 'the forecast was never called');
  if (!q.has('start_date')) return; // forecast_days=7 + timezone lets the provider pick local today
  const h = horizonFor(body(this).location.timezone);
  assert.equal(q.get('start_date'), h[0]);
  assert.equal(q.get('end_date'), h[6]);
});

Then(
  'the {string} score on day {int} is not lower than on day {int}',
  function (this: ActivityWorld, act: string, later: number, earlier: number) {
    const a = activityOn(body(this), later, act);
    const b = activityOn(body(this), earlier, act);
    assert.ok(
      a.score >= b.score,
      `${act}: day ${later} scored ${a.score} < day ${earlier} ${b.score}; the only difference is the varied input. ` +
        `Reasoning: "${a.reasoning}" vs "${b.reasoning}"`,
    );
  },
);
