@harness
Feature: Test harness self-check
  The spec suite is red until the API exists. These scenarios prove the harness itself
  (Open-Meteo stub, contract validators, HTTP client) works, so a red spec run means
  "missing behaviour", not "broken tests". They never call the system under test.

  Rule: Stub - the Open-Meteo stub behaves like the provider

    # Documented matching rules: https://open-meteo.com/en/docs/geocoding-api
    Scenario Outline: Geocoding search applies Open-Meteo's name matching ("<name>")
      Given Open-Meteo geocoding knows the following places:
        | place           |
        | London, GB      |
        | London, CA      |
        | Londonderry, GB |
        | Ii, FI          |
      When the harness calls the stubbed geocoding search for "<name>"
      Then the stub returns geocoding results named "<names>"

      Examples:
        | name       | names                       | rule                     |
        | L          |                             | 1 char: no results       |
        | Lo         |                             | 2 chars: exact name only |
        | Ii         | Ii                          | 2 chars: exact match     |
        | Lon        | London, London, Londonderry | 3+ chars: prefix         |
        | London, CA | London                      | country qualifier        |

    Scenario: Geocoding search omits "results" when nothing matches, like Open-Meteo
      Given Open-Meteo geocoding finds no places
      When the harness calls the stubbed geocoding search for "Nowhere"
      Then the stub returns no "results" key

    Scenario: Geocoding search caps results at Open-Meteo's default count of 10
      Given Open-Meteo geocoding knows 12 towns named "Springfield"
      When the harness calls the stubbed geocoding search for "Springfield"
      Then the stub returns 10 geocoding results

    Scenario: Location lookup resolves known ids and returns 404 for unknown ids
      Given Open-Meteo geocoding knows the following places:
        | place       |
        | Zermatt, CH |
      When the harness looks up the location id of "Zermatt, CH"
      Then the stub responded with status 200
      And the stubbed lookup returned the place "Zermatt, CH"
      When the harness looks up the location id "999999999"
      Then the stub responded with status 404

    Scenario: The forecast is served by coordinates, 7 consecutive days per location
      Given the forecast for "Zermatt, CH" is "heavy snowfall" every day
      And the forecast for "London, GB" is "clear and mild" every day
      When the harness calls the stubbed forecast for "London, GB"
      Then the stubbed forecast has 7 consecutive days
      And the stubbed forecast snowfall on day 1 is 0
      When the harness calls the stubbed forecast for "Zermatt, CH"
      Then the stubbed forecast snowfall on day 1 is 25

    Scenario: Injected faults override primed responses on every route
      Given Open-Meteo geocoding knows the following places:
        | place      |
        | London, GB |
      And the forecast for "London, GB" is "clear and mild" every day
      And the Open-Meteo forecast responds with status 503
      And the Open-Meteo location lookup responds with status 503
      And the Open-Meteo geocoding search responds with malformed JSON
      When the harness calls the stubbed forecast for "London, GB"
      Then the stub responded with status 503
      When the harness looks up the location id of "London, GB"
      Then the stub responded with status 503
      When the harness calls the stubbed geocoding search for "Lond"
      Then the stub responded with a body that is not valid JSON

    Scenario: Injected delays really delay the response
      Given the forecast for "London, GB" is "clear and mild" every day
      And the Open-Meteo forecast takes 300 ms to respond
      When the harness calls the stubbed forecast for "London, GB"
      Then the stub took at least 300 ms to respond

    Scenario: Every scenario starts with an empty stub (isolation)
      Then the stub has no recorded requests
      And the stub serves no geocoding results for "London"
      And the stub has no forecast primed for "London, GB"

  Rule: Validators - only contract-valid payloads pass, with a contract message otherwise

    Scenario Outline: A valid <kind> payload passes
      Then the "<kind>" validator accepts the reference payload

      Examples:
        | kind            |
        | location search |
        | ranking         |
        | error           |

    # Schema (docs/openapi.yaml, ajv) runs first; semantic invariants run only on a
    # schema-valid payload. Every rejection surfaces as a [CONTRACT_VIOLATION] message.
    Scenario Outline: An invalid <kind> payload is a contract violation (<defect>)
      Then a "<kind>" response with <defect> fails as a contract violation mentioning "<problem>"

      Examples: Required fields
        | kind            | defect                      | problem                    |
        | ranking         | a missing location          | location                   |
        | ranking         | a missing location timezone | timezone                   |
        | ranking         | 6 days                      | must NOT have fewer than 7 |
        | ranking         | 3 activities on day 2       | must NOT have fewer than 4 |
        | location search | a numeric id                | must be string             |

      Examples: Dates
        | kind    | defect                        | problem                  |
        | ranking | an impossible date 2026-02-30 | must match format        |
        | ranking | 7 identical dates             | distinct dates           |
        | ranking | a gap between dates           | consecutive              |

      Examples: Activities and ranks
        | kind    | defect                                  | problem                  |
        | ranking | a duplicated activity on day 1          | 4 distinct activities    |
        | ranking | duplicate ranks on day 1                | ranks must be unique     |
        | ranking | ranks that disagree with array order    | must have rank           |
        | ranking | activities ordered against their scores | order contradicts scores |

      Examples: Scores, labels and reasoning
        | kind    | defect                 | problem              |
        | ranking | a score of -1          | must be >= 0         |
        | ranking | a score of 101         | must be <= 100       |
        | ranking | a fractional score     | must be integer      |
        | ranking | a label that disagrees | does not match score |
        | ranking | an empty reasoning     | must match pattern   |

      Examples: Time zone and identification
        | kind            | defect                           | problem               |
        | ranking         | a Mars/Olympus location timezone | not an IANA time zone |
        | ranking         | a whitespace-only location name  | must match pattern    |
        | location search | a whitespace-only result name    | must match pattern    |
        | location search | the same location twice          | must not repeat       |
        | error           | a Mars/Olympus candidate timezone | not an IANA time zone |

      Examples: Errors and candidates
        | kind  | defect                              | problem                    |
        | error | an unknown error code               | must be equal to one of    |
        | error | a single ambiguity candidate        | must NOT have fewer than 2 |
        | error | the same candidate twice            | distinct locations         |
        | error | candidates on a non-ambiguity error | only allowed               |

  Rule: HTTP client - non-contract responses and transport failures are classified

    Scenario: An HTML page served with status 200 cannot satisfy a success assertion
      Given a stand-in service that answers every request with an HTML page
      When the harness sends a ranking request to the stand-in service
      Then the success assertion fails with a message mentioning "[NON_JSON_RESPONSE]"

    Scenario: Malformed JSON cannot satisfy a success assertion
      Given a stand-in service that answers every request with JSON '{"days": ['
      When the harness sends a ranking request to the stand-in service
      Then the success assertion fails with a message mentioning "[NON_JSON_RESPONSE]"

    Scenario: Transport failures are classified for diagnostics
      Then a request to an unused local port fails as "CONNECTION_REFUSED"
      And a request to a server that never answers fails as "TIMEOUT"
      And a request to a server that sends headers but stalls the body fails as "TIMEOUT"
      And a request to a server that drops the connection mid-body fails as "NETWORK"
