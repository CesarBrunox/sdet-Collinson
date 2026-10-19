@rankings @contract
Feature: Activity ranking response shape
  As a front-end developer rendering a 7-day activity planner
  I want every ranking response to have a predictable, complete structure
  So that I can render it without defensive guesswork

  # Contract: GET /api/v1/rankings?locationId={id}
  # Ranked activities: Skiing, Surfing, Outdoor Sightseeing, Indoor Sightseeing.
  # Date ownership: the API does NOT pick dates itself. It asks Open-Meteo for 7 days in the
  # location's time zone and must preserve the provider's calendar dates unchanged.

  Background:
    Given the forecast for "London, GB" is "clear and mild" every day

  @smoke
  Scenario: A ranking is returned for the selected location
    When I request rankings for location "London, GB"
    Then I receive a valid ranking response
    And the response identifies the location "London, GB"

  Scenario: The response covers 7 consecutive days matching the forecast dates
    When I request rankings for location "London, GB"
    Then I receive a valid ranking response
    And the response contains 7 consecutive days matching the forecast dates

  Scenario: Every day ranks each of the four activities exactly once
    When I request rankings for location "London, GB"
    Then I receive a valid ranking response
    And each day contains exactly these activities:
      | Skiing              |
      | Surfing             |
      | Outdoor Sightseeing |
      | Indoor Sightseeing  |

  Scenario: Each day's activities are ranked 1 to 4 and sorted best first
    When I request rankings for location "London, GB"
    Then I receive a valid ranking response
    And each day ranks its activities 1 to 4 in descending score order

  Scenario: The suitability measure is a bounded score with a matching label
    When I request rankings for location "London, GB"
    Then I receive a valid ranking response
    And every score is an integer between 0 and 100
    And every suitability label matches its score band:
      | min score | label      |
      | 80        | Excellent  |
      | 60        | Good       |
      | 40        | Fair       |
      | 20        | Poor       |
      | 0         | Unsuitable |

  Scenario: Every activity explains its ranking in plain language
    When I request rankings for location "London, GB"
    Then I receive a valid ranking response
    And every activity has a non-empty reasoning of at most 200 characters

  Scenario: The forecast is fetched once, for the right place, for 7 days, in local time
    When I request rankings for location "London, GB"
    Then I receive a valid ranking response
    And the Open-Meteo forecast was called exactly once
    And the forecast was requested for the coordinates of "London, GB"
    And the forecast was requested for 7 days
    And the forecast was requested in the time zone of "London, GB"
    And the forecast request includes the daily variables:
      | weather_code       |
      | temperature_2m_max |
      | temperature_2m_min |
      | precipitation_sum  |
      | snowfall_sum       |
      | wind_speed_10m_max |

  Scenario: Days are expressed in the location's local calendar
    Given the forecast for "Auckland, NZ" is "clear and mild" every day
    When I request rankings for location "Auckland, NZ"
    Then I receive a valid ranking response
    And the response contains 7 consecutive days matching the forecast dates
    And the forecast was requested in the time zone of "Auckland, NZ"

  # Reference clock, used ONLY for the 7-day horizon: the API is started with
  # CLOCK_NOW = REFERENCE_NOW (default 2026-11-02T22:30:00Z). "The next 7 days" = the
  # location's local date at that instant plus 6 days (already 3 November in Auckland).
  Scenario Outline: The 7-day horizon starts on the location's local today at the reference time (<place>)
    Given the forecast for "<place>" is "clear and mild" every day
    When I request rankings for location "<place>"
    Then I receive a valid ranking response
    And the days are the location's 7 local dates starting at the reference time
    And the first day is "<local today>"
    And any explicit forecast date range matches the horizon

    Examples:
      | place        | local today |
      | London, GB   | 2026-11-02  |
      | Auckland, NZ | 2026-11-03  |
      | São Paulo, BR | 2026-11-02 |

  # Calendar-boundary examples simulate the PROVIDER's dates only (they override day 1),
  # proving the API preserves them; they make no claim about the clock.
  @boundary
  Scenario Outline: Provider calendar dates are preserved across calendar boundaries
    Given the provider's forecast starts on "<first day>"
    And the forecast for "<place>" is "clear and mild" every day
    When I request rankings for location "<place>"
    Then I receive a valid ranking response
    And the response days run from "<first day>" to "<last day>"

    Examples:
      | boundary                    | place        | first day  | last day   |
      | month end                   | London, GB   | 2026-11-28 | 2026-12-04 |
      | year end                    | London, GB   | 2026-12-29 | 2027-01-04 |
      | leap day                    | London, GB   | 2028-02-26 | 2028-03-03 |
      | DST ends (Europe/London)    | London, GB   | 2026-10-23 | 2026-10-29 |
      | DST starts (Pacific/Auck.)  | Auckland, NZ | 2026-09-24 | 2026-09-30 |
