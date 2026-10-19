@rankings @resilience
Feature: Resilience to Open-Meteo failures
  As a user
  I want a clear, fast answer even when the weather provider misbehaves
  So that the app never hangs or shows wrong rankings

  # Contract: upstream failures map to 502 UPSTREAM_UNAVAILABLE, upstream slowness to
  # 504 UPSTREAM_TIMEOUT. Technical dependency timeout (not a product SLA): the API gives up
  # on Open-Meteo after <= 3 s, so a 4 s upstream delay must surface as 504 within 3.5 s on
  # every upstream path (forecast, geocoding search, location lookup). Never a 500, never
  # partial data, never rankings computed from default/zero weather values.

  Background:
    Given the forecast for "London, GB" is "clear and mild" every day
    And Open-Meteo geocoding knows the following places:
      | place      |
      | London, GB |

  Rule: Forecast provider failures

    @negative
    Scenario Outline: Forecast provider error statuses are reported as a gateway error (<upstream status>)
      Given the Open-Meteo forecast responds with status <upstream status>
      When I request rankings for location "London, GB"
      Then I receive a 502 "UPSTREAM_UNAVAILABLE" error
      And the error message is human readable

      Examples:
        | upstream status |
        | 400             |
        | 429             |
        | 500             |
        | 503             |

    @negative
    Scenario: A malformed forecast payload is not passed on to the user
      Given the Open-Meteo forecast responds with malformed JSON
      When I request rankings for location "London, GB"
      Then I receive a 502 "UPSTREAM_UNAVAILABLE" error

    @negative
    Scenario Outline: An incomplete or inconsistent forecast is rejected (<shape>)
      Given the Open-Meteo forecast <shape>
      When I request rankings for location "London, GB"
      Then I receive a 502 "UPSTREAM_UNAVAILABLE" error

      Examples:
        | shape                                              |
        | returns only 5 days                                |
        | has null values on day 3                           |
        | has a null "snowfall_sum" value on day 6           |
        | is missing the "temperature_2m_max" array          |
        | has a "wind_speed_10m_max" array with 6 values     |
        | has a duplicated date on day 4                     |
        | has a gap in its dates after day 2                 |

    Scenario Outline: Every optional provider field may be absent (<optional field>)
      Given the Open-Meteo forecast is missing the optional "<optional field>" array
      When I request rankings for location "London, GB"
      Then I receive a valid ranking response

      Examples:
        | optional field                |
        | rain_sum                      |
        | wind_gusts_10m_max            |
        | precipitation_probability_max |
        | daily_units                   |

    Scenario: All optional provider fields may be absent at once
      Given the Open-Meteo forecast is missing every optional field
      When I request rankings for location "London, GB"
      Then I receive a valid ranking response
      And on day 1 "Outdoor Sightseeing" is ranked 1

    @negative @slow
    Scenario: A slow forecast provider times out instead of hanging the client
      # Fails if the SUT waits for the 4 s response (status would be 200 after >= 4000 ms)
      # and passes only inside the declared envelope: 504 within 3.5 s.
      Given the Open-Meteo forecast takes 4000 ms to respond
      When I request rankings for location "London, GB"
      Then I receive a 504 "UPSTREAM_TIMEOUT" error
      And the response is received within 3500 ms

  Rule: Geocoding search and lookup failures

    @negative
    Scenario Outline: Geocoding failures during search are reported as a gateway error (<fault>)
      Given the Open-Meteo geocoding search <fault>
      When I search for locations matching "Lond"
      Then I receive a <status> "<code>" error
      And the response is received within 3500 ms

      Examples:
        | fault                         | status | code                 |
        | responds with status 503      | 502    | UPSTREAM_UNAVAILABLE |
        | responds with malformed JSON  | 502    | UPSTREAM_UNAVAILABLE |
        | takes 4000 ms to respond      | 504    | UPSTREAM_TIMEOUT     |

    @negative
    Scenario Outline: Geocoding failures on the direct city path never yield rankings (<fault>)
      Given the Open-Meteo geocoding search <fault>
      When I request rankings for the city "London"
      Then I receive a <status> "<code>" error
      And the response is received within 3500 ms
      And the Open-Meteo forecast was not called

      Examples:
        | fault                         | status | code                 |
        | responds with status 500      | 502    | UPSTREAM_UNAVAILABLE |
        | responds with malformed JSON  | 502    | UPSTREAM_UNAVAILABLE |
        | takes 4000 ms to respond      | 504    | UPSTREAM_TIMEOUT     |

    @negative
    Scenario Outline: Location lookup failures are not mistaken for "not found" (<fault>)
      Given the Open-Meteo location lookup <fault>
      When I request rankings for location "London, GB"
      Then I receive a <status> "<code>" error
      And the response is received within 3500 ms
      And the Open-Meteo forecast was not called

      Examples:
        | fault                         | status | code                 |
        | responds with status 503      | 502    | UPSTREAM_UNAVAILABLE |
        | responds with malformed JSON  | 502    | UPSTREAM_UNAVAILABLE |
        | takes 4000 ms to respond      | 504    | UPSTREAM_TIMEOUT     |
