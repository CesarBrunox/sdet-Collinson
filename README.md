# Activity Ranking API: spec-first BDD suite

A Cucumber + TypeScript specification for the **Activity Ranking API**: enter a city or town
(full or partial name) and get the next 7 days with **Skiing, Surfing, Outdoor Sightseeing and
Indoor Sightseeing** ranked per day by how well the [Open-Meteo](https://open-meteo.com) weather
suits them.

**The API does not exist yet.** The tests were written first, so the API specification is
expected to be red: each failing scenario is behaviour the implementation still has to deliver.
The suite proves that this red state is the _right_ red, i.e. caused by the missing API and not
by broken automation.

| Part                | Scenarios | Runs in             | Expected now                      |
| ------------------- | --------- | ------------------- | --------------------------------- |
| API specification   | 104       | `npm test`          | red (nothing to test against)     |
| Harness self-checks | 44        | `npm run check`, CI | green                             |
| Live smoke (opt-in) | 7         | `npm run test:live` | green (needs internet; not in CI) |

## Install and run

Requires **Node 24** (`.nvmrc`).

```bash
npm ci
npm run check   # typecheck, lint, format, step bindings, harness, verify:red, verify:html (green)
npm test        # the API specification against API_BASE_URL (non-zero exit while the API is absent)
npm run test:live  # optional: the real Open-Meteo still behaves like the stub
```

Individual diagnostics: `typecheck`, `lint`, `format:check`, `test:dry` (fails on undefined,
ambiguous or pending steps), `test:harness`, `test:smoke`, `verify:red`, `verify:html`.
Reports go to `reports/spec`, `reports/harness`, `reports/live`, `reports/red-state` and
`reports/bindings` (HTML + JSON).

## Contract

The contract is [`docs/openapi.yaml`](docs/openapi.yaml) (OpenAPI 3.1), the single source of truth.
In short:

- `GET /api/v1/locations?query=` - type-ahead search: at most 10 matches in provider order, each
  with id, name, country, optional region, coordinates and time zone; `[]` when nothing matches.
- `GET /api/v1/rankings?locationId=` or `?city=` - 7 days; per day the 4 activities with `rank`
  (1-4), `score` (integer 0-100), `suitability` label (score band) and `reasoning`.
- Errors: `400 VALIDATION_ERROR`, `404 LOCATION_NOT_FOUND`, `409 AMBIGUOUS_LOCATION` (with
  `candidates` the UI can show as a picker), `502 UPSTREAM_UNAVAILABLE`, `504 UPSTREAM_TIMEOUT`.

Every response is validated against the schema (ajv). Only a schema-valid payload then goes
through the semantic invariants in [`src/validation/contractValidators.ts`](src/validation/contractValidators.ts):
distinct consecutive dates, 4 distinct activities, ranks in order and consistent with scores,
label matching the band, IANA time zones, distinct candidates. A success assertion therefore
needs the expected status, an `application/json` body and a contract-valid payload.

## Pointing a future API at the suite

The API runs as a separate process, so the suite starts an Open-Meteo **HTTP stub** on port 4010
(`/v1/search`, `/v1/get`, `/v1/forecast`, same payload shapes and documented matching rules) and
the API must be started against it, with the reference clock:

```bash
# in the API repository
OPEN_METEO_GEOCODING_BASE_URL=http://localhost:4010 \
OPEN_METEO_FORECAST_BASE_URL=http://localhost:4010 \
CLOCK_NOW=2026-11-02T22:30:00Z npm start
# in this repository
API_BASE_URL=http://localhost:3000 npm test
```

```powershell
$env:OPEN_METEO_GEOCODING_BASE_URL = 'http://localhost:4010'
$env:OPEN_METEO_FORECAST_BASE_URL  = 'http://localhost:4010'
$env:CLOCK_NOW = '2026-11-02T22:30:00Z'; npm start          # API repository
$env:API_BASE_URL = 'http://localhost:3000'; npm test       # this repository
```

`CLOCK_NOW` is used **only** for the "next 7 days" horizon: the days must start on the
destination's local date at that instant (at 22:30 UTC it is already 3 November in Auckland).
The suite's side is `REFERENCE_NOW` (same default). Other variables: `OPEN_METEO_STUB_PORT`
(4010), `API_TIMEOUT_MS` (5000); see `.env.example` (reference only, not loaded automatically).

## How to read the results

- **`npm run check` green** means the automation is trustworthy: the stub, validators and HTTP
  client pass their self-checks, every step is bound, and two red-state verifiers pass.
- **`verify:red`** runs the specification against a free port: every scenario must fail at its
  action step with `[CONNECTION_REFUSED]`, never earlier (arrangement) or for another reason.
- **`verify:html`** runs it against an unrelated service that answers `200 text/html`: no
  scenario may pass, and each must fail at the JSON gate with `[NON_JSON_RESPONSE]`.
- **`npm test` red** is therefore the expected state until an API exists. Against a real API,
  failure messages carry a category: `[NON_JSON_RESPONSE]`, `[STATUS_MISMATCH]` or
  `[CONTRACT_VIOLATION]` (with the list of contract problems), and transport errors say
  `CONNECTION_REFUSED`, `TIMEOUT` or `NETWORK`.

Requirement-to-scenario mapping: [`docs/traceability.md`](docs/traceability.md).

## Assumptions

- Versioned REST/JSON under `/api/v1`; search and ranking are separate steps (type-ahead, select,
  view); `?city=` is a shortcut that answers `409` with candidates when the name is ambiguous.
- `locationId` is the Open-Meteo geocoding id. Dates are the provider's local calendar dates.
- Ranking rules are asserted as behaviour (relative order, bands, reasoning keywords), never
  exact scores. Thresholds beyond the brief (e.g. snowfall bands) are tagged `@policy`: a proposal
  for the product owner. Ties are ordered alphabetically by activity.
- An incomplete or partly null forecast is an upstream error (`502`), not a partial week.
- Technical dependency timeout (not a product SLA): the API gives up on Open-Meteo after <= 3 s
  and answers `504`; the suite allows 3.5 s.

## Limitations

- **Not yet executed against a real API.** Success paths are specified and their assertions are
  self-tested, but only an implementation can show the ranking rules are right.
- Reasoning checks are keyword-based ("snow", "wind"...), not a judgement of the sentence.
- Surfing uses wind as a proxy for swell (no Marine API). Auth, caching, rate limits and i18n
  are out of scope. Scenarios run serially against one stub port.
- The stub does not model Open-Meteo's alternate/localised names; the live smoke test checks
  only the best match.

## Use of AI

I used AI assistance to draft and review scenarios, fixtures and documentation, and I reviewed,
ran and refined everything myself.
