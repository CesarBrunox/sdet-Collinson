# Traceability: requirement → scenarios

Counts from `npm run test:dry` (each Scenario Outline example counts once): API specification
104 scenarios, harness 44, live smoke 7 (opt-in).

| Requirement                           | Feature                                                    | Key scenarios                                                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Accepts a city or town name           | `03_ranking_by_city_name`                                  | Unambiguous city → rankings; ambiguous → `409` with candidates, user picks one; unknown → `404`; invalid input → `400`                                             |
| Partial name returns possible matches | `01_location_search`                                       | Partial name returns every match, capped at 10 in provider order; short-query rules; country qualifier; accents; empty list; search → select → rank                |
| Uses Open-Meteo                       | `02_ranking_response_contract`, `05_open_meteo_resilience` | One forecast call for the right coordinates, 7 days, local time zone, required variables; upstream errors → `502`, slowness → `504`; optional fields may be absent |
| Next 7 days                           | `02_ranking_response_contract`                             | 7 consecutive days starting on the destination's local date at the reference clock (London, Auckland, São Paulo); provider dates preserved across boundaries       |
| 4 activities ranked per day           | `02`, `04_ranking_rules`                                   | Each day has Skiing, Surfing, Outdoor and Indoor Sightseeing once, ranks 1-4 sorted by score; rules per activity; mixed week; repeatability                        |
| Suitability measure                   | `02`, `04`                                                 | Integer score 0-100 with a matching label; snowfall thresholds (`@policy`); more snow never lowers Skiing, more rain never raises Outdoor Sightseeing              |
| Reasoning                             | `02`, `04`                                                 | Non-empty, ≤ 200 characters; mentions the deciding weather ("snow", "clear", "wind", "rain", "thunderstorm", "overcast")                                           |
| Front-end UX                          | `01`, `02`, `03`                                           | Type-ahead cap and empty list, region/country to tell places apart, `409` candidate picker, human-readable errors, local dates, display-ready labels               |
| Trustworthy automation                | `00_harness`, `scripts/verify-red-state.mjs`               | Stub, validators and HTTP client self-checks; `verify:red` (all fail with CONNECTION_REFUSED) and `verify:html` (none pass, all NON_JSON_RESPONSE)                 |
