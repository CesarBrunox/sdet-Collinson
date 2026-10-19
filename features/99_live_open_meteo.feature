@live
Feature: Optional live smoke test of the real Open-Meteo API
  Opt-in only (npm run test:live). It is excluded from the default, harness, spec, red-state
  and CI blocking runs because it depends on the network and a third-party service.
  Purpose: detect drift between the real provider and the stub/fixtures this suite relies on.
  It never calls the Activity Ranking API.

  Scenario: Geocoding search returns the fields the stub reproduces
    When I call the live geocoding search for "London"
    Then the live response has status 200
    And every live geocoding result has the fields id, name, latitude, longitude, country, country_code, timezone

  # The real service also matches alternate/localised names, which the stub does not model;
  # the best (first) live result must follow the primary-name rule the stub implements.
  Scenario Outline: Live geocoding follows the documented matching rules ("<name>")
    When I call the live geocoding search for "<name>"
    Then the live response has status 200
    And the live geocoding results satisfy the "<rule>" rule for "<name>"

    Examples:
      | name | rule           |
      | L    | no results     |
      | Lo   | exact name     |
      | Lon  | prefix         |

  Scenario: Live geocoding rejects an out-of-range count with 400
    When I call the live geocoding search for "London" with count "101"
    Then the live response has status 400

  Scenario: Live lookup by id resolves a location
    When I call the live location lookup for id "2643743"
    Then the live response has status 200
    And the live lookup result is named "London"

  Scenario: Live forecast returns 7 consecutive local days with every variable the stub serves
    When I call the live forecast for "London, GB" with the stub's daily variables
    Then the live response has status 200
    And the live forecast has 7 consecutive real dates starting on the local today in "Europe/London"
    And every live daily array the stub serves has 7 values
