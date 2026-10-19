@locations
Feature: Location search by full or partial city/town name
  As a user typing a place name into a search box
  I want the API to suggest matching cities and towns
  So that I can pick the exact place I mean before seeing activity rankings

  # Contract: GET /api/v1/locations?query={text}
  # Matching is delegated to Open-Meteo geocoding, which is stubbed for determinism.
  # Success scenarios first require HTTP 200 and a body that passes the runtime contract
  # validator, so an unrelated service or an HTML page can never satisfy them.

  Background:
    Given Open-Meteo geocoding knows the following places:
      | place           |
      | London, GB      |
      | London, CA      |
      | Londonderry, GB |

  @smoke
  Scenario: A partial name returns every possible match
    When I search for locations matching "Lond"
    Then I receive a valid location search response
    And the location results contain, in order:
      | name        | country        | region           |
      | London      | United Kingdom | England          |
      | London      | Canada         | Ontario          |
      | Londonderry | United Kingdom | Northern Ireland |

  Scenario: Same-name matches carry enough detail to tell them apart
    When I search for locations matching "London"
    Then I receive a valid location search response
    And every location result has an id, name, country, coordinates and timezone
    And results with the same name differ by country or region

  Scenario: The user's query is passed to the geocoder trimmed and echoed back
    When I search for locations matching "  Lond  "
    Then I receive a valid location search response
    And Open-Meteo geocoding was asked for the name "Lond"
    And the response echoes the query "Lond"

  Scenario: Searching does not fetch any weather data
    When I search for locations matching "Lond"
    Then I receive a valid location search response
    And the Open-Meteo forecast was not called

  Scenario: The suggestion list is capped at 10 and keeps the provider's relevance order
    Given Open-Meteo geocoding knows 12 towns named "Springfield"
    When I search for locations matching "Springfield"
    Then I receive a valid location search response
    And the location results are the first 10 "Springfield" towns in provider order
    And Open-Meteo geocoding was asked for at most 10 results or the response was truncated to 10

  Scenario: A name with no matches returns an empty list, not an error
    Given Open-Meteo geocoding finds no places
    When I search for locations matching "Xyzzyqwv"
    Then I receive a valid location search response
    And the location results are empty

  Scenario Outline: Non-ASCII and multi-word names are supported
    Given Open-Meteo geocoding knows the following places:
      | place   |
      | <place> |
    When I search for locations matching "<query>"
    Then I receive a valid location search response
    And the first location result is named "<name>"

    Examples:
      | query     | place         | name      |
      | São Paulo | São Paulo, BR | São Paulo |
      | sao paulo | São Paulo, BR | São Paulo |

  # Open-Meteo matching rules (https://open-meteo.com/en/docs/geocoding-api): 1 character
  # matches nothing, 2 characters must match a whole name exactly, 3+ characters are a
  # case- and diacritic-insensitive prefix. The API passes the trimmed query through.
  @boundary
  Scenario Outline: Short queries follow the geocoder's matching rules (<query>)
    Given Open-Meteo geocoding knows the following places:
      | place  |
      | Ii, FI |
    When I search for locations matching "<query>"
    Then I receive a valid location search response
    And the location result names are "<names>"

    Examples:
      | query | names                       | rule                              |
      | Lo    |                             | 2 chars: no place is named "Lo"   |
      | Ii    | Ii                          | 2 chars: exact name match         |
      | ii    | Ii                          | exact match is case-insensitive   |
      | Lon   | London, London, Londonderry | 3+ chars: prefix match            |

  Scenario: A country qualifier narrows same-name matches
    When I search for locations matching "London, Canada"
    Then I receive a valid location search response
    And the location results contain, in order:
      | name   | country | region  |
      | London | Canada  | Ontario |

  Scenario: A place without a first-level region omits the optional region field
    Given Open-Meteo geocoding knows the following places:
      | place            |
      | Vatican City, VA |
    When I search for locations matching "Vatican"
    Then I receive a valid location search response
    And the first location result is named "Vatican City"
    And the first location result has no "region" field

  @flow
  Scenario: The user searches, selects a suggestion and gets that place's rankings
    Given the forecast for "London, CA" is "light snow" every day
    When I search for locations matching "Lond"
    And I select the search result in "Ontario"
    And I request rankings for the selected location
    Then I receive a valid ranking response
    And the response identifies the location "London, CA"
    And the forecast was requested for the coordinates of "London, CA"
    And the Open-Meteo forecast was called exactly once

  @negative
  Scenario Outline: Invalid queries are rejected before calling Open-Meteo
    When I search for locations matching "<query>"
    Then I receive a 400 "VALIDATION_ERROR" error
    And Open-Meteo geocoding was not called

    Examples:
      | query | reason                        |
      |       | empty                         |
      | L     | below the 2-character minimum |

  @negative
  Scenario: A whitespace-only query is rejected
    When I search for locations matching "   "
    Then I receive a 400 "VALIDATION_ERROR" error
    And Open-Meteo geocoding was not called

  @negative
  Scenario: A missing query parameter is rejected
    When I search for locations without a query
    Then I receive a 400 "VALIDATION_ERROR" error

  @negative @boundary
  Scenario Outline: Query length boundaries
    When I search for locations matching a <length>-character name
    Then I receive a valid response with status <status>

    Examples:
      | length | status |
      | 2      | 200    |
      | 100    | 200    |
      | 101    | 400    |
