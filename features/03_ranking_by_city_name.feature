@rankings
Feature: Requesting rankings directly by city or town name
  As a user who types a full place name
  I want rankings straight away when the name is unambiguous
  And a list of candidates when it is not

  # Contract: GET /api/v1/rankings?city={name}
  #   - exactly one geocoding match -> 200 with rankings
  #   - several matches            -> 409 AMBIGUOUS_LOCATION with candidates (no forecast call)
  #   - no match                   -> 404 LOCATION_NOT_FOUND

  Scenario: An unambiguous city name returns rankings
    Given Open-Meteo geocoding knows the following places:
      | place       |
      | Zermatt, CH |
    And the forecast for "Zermatt, CH" is "heavy snowfall" every day
    When I request rankings for the city "Zermatt"
    Then I receive a valid ranking response
    And the response identifies the location "Zermatt, CH"
    And the response contains 7 consecutive days matching the forecast dates

  Scenario: An ambiguous name returns distinguishable candidates and fetches no weather
    Given Open-Meteo geocoding knows the following places:
      | place      |
      | London, GB |
      | London, CA |
    When I request rankings for the city "London"
    Then I receive a 409 "AMBIGUOUS_LOCATION" error
    And the error lists these candidate locations:
      | name   | country        | region  |
      | London | United Kingdom | England |
      | London | Canada         | Ontario |
    And the Open-Meteo forecast was not called

  @flow
  Scenario: The user picks one of the ambiguous candidates and gets its rankings
    Given Open-Meteo geocoding knows the following places:
      | place      |
      | London, GB |
      | London, CA |
    And the forecast for "London, CA" is "light snow" every day
    When I request rankings for the city "London"
    And I choose the candidate in "Canada" from the ambiguity error
    And I request rankings for the selected location
    Then I receive a valid ranking response
    And the response identifies the location "London, CA"
    And the forecast was requested for the coordinates of "London, CA"
    And no forecast was requested before a location was selected

  @negative
  Scenario: An unknown city returns a helpful not-found error
    Given Open-Meteo geocoding finds no places
    When I request rankings for the city "Atlantisville"
    Then I receive a 404 "LOCATION_NOT_FOUND" error
    And the error message is human readable
    And the Open-Meteo forecast was not called

  @negative
  Scenario: An unknown location id returns not found
    Given Open-Meteo geocoding finds no places
    When I request rankings with query parameters:
      | locationId | 999999999 |
    Then I receive a 404 "LOCATION_NOT_FOUND" error
    And the Open-Meteo forecast was not called

  @negative
  Scenario Outline: Invalid ranking requests are rejected before calling Open-Meteo
    When I request rankings with query parameters:
      | <param> | <value> |
    Then I receive a 400 "VALIDATION_ERROR" error
    And Open-Meteo was not called at all

    Examples:
      | case                 | param      | value        |
      | 1-character city     | city       | L            |
      | empty city           | city       |              |
      | non-numeric id       | locationId | not-a-number |
      | negative id          | locationId | -5           |
      | zero id              | locationId | 0            |
      | fractional id        | locationId | 1.5          |
      | unknown parameter    | foo        | bar          |

  @negative
  Scenario: A whitespace-only city is rejected
    When I request rankings for the city "   "
    Then I receive a 400 "VALIDATION_ERROR" error
    And Open-Meteo was not called at all

  @negative
  Scenario: A request with neither city nor locationId is rejected
    When I request rankings with no parameters
    Then I receive a 400 "VALIDATION_ERROR" error

  @negative
  Scenario: Supplying both city and locationId is rejected as ambiguous input
    When I request rankings with query parameters:
      | city       | London  |
      | locationId | 2643743 |
    Then I receive a 400 "VALIDATION_ERROR" error
