@rankings @rules
Feature: Ranking activities by weather suitability
  As a user planning my week
  I want each day's activities ranked by how suitable the weather is
  So that I can pick the best day for what I want to do

  # Ticket requirement: each day/activity is ranked on weather suitability with a reason.
  # Everything tagged @policy below is a PROPOSED scoring policy (thresholds, bands), written
  # down so the product owner can agree or change it in Gherkin. It is not in the ticket.
  # Scenarios pin down BEHAVIOUR (relative ordering, bands, thresholds and explanations),
  # never exact scores, so the implementation keeps freedom to tune weights.

  Rule: Skiing is the top activity on cold days with significant snowfall

    Scenario: Heavy snowfall makes skiing the best option
      Given the forecast for "Zermatt, CH" is "heavy snowfall" every day
      When I request rankings for location "Zermatt, CH"
      Then I receive a valid ranking response
      And on every day "Skiing" is ranked 1
      And on day 1 the "Skiing" score is at least 80
      And on day 1 the reasoning for "Skiing" mentions "snow"

    Scenario: Skiing is unsuitable without snow in warm weather
      Given the forecast for "London, GB" is "clear and mild" every day
      When I request rankings for location "London, GB"
      Then I receive a valid ranking response
      And on day 1 the "Skiing" suitability is "Unsuitable"
      And on day 1 the reasoning for "Skiing" mentions "snow"

    @boundary @policy
    Scenario Outline: Snowfall thresholds drive skiing suitability (<snowfall cm> cm at <max temp> °C)
      Given the forecast for "Zermatt, CH" is "freezing and dry" every day
      And on day 1 the forecast "snowfall" is <snowfall cm>
      And on day 1 the forecast "max temperature" is <max temp>
      When I request rankings for location "Zermatt, CH"
      Then I receive a valid ranking response
      And on day 1 the "Skiing" suitability is "<label>"

      # Proposed bands: < 1 cm Poor (cold, no fresh snow) | 1 to < 5 cm Fair | 5 to < 20 cm Good | >= 20 cm Excellent.
      Examples:
        | snowfall cm | max temp | label     |
        | 0.9         | -5       | Poor      |
        | 1           | -5       | Fair      |
        | 4.9         | -5       | Fair      |
        | 5           | -5       | Good      |
        | 19.9        | -5       | Good      |
        | 20          | -5       | Excellent |

    # Monotonicity: two days that differ ONLY in snowfall, in the same response.
    @monotonicity
    Scenario Outline: More snow never lowers the Skiing score, all else equal (<less> cm vs <more> cm)
      Given the forecast for "Zermatt, CH" is "freezing and dry" every day
      And on day 1 the forecast "snowfall" is <less>
      And on day 2 the forecast "snowfall" is <more>
      When I request rankings for location "Zermatt, CH"
      Then I receive a valid ranking response
      And the "Skiing" score on day 2 is not lower than on day 1

      Examples:
        | less | more |
        | 0    | 2    |
        | 2    | 10   |
        | 10   | 30   |

  Rule: Surfing needs wind-driven swell but is unsafe in storms

    Scenario: A warm, breezy day favours surfing over skiing
      Given the forecast for "Newquay, GB" is "warm and windy" every day
      When I request rankings for location "Newquay, GB"
      Then I receive a valid ranking response
      And on day 1 "Surfing" scores higher than "Skiing"
      And on day 1 the "Surfing" score is at least 60
      And on day 1 the reasoning for "Surfing" mentions "wind"

    Scenario: Flat calm conditions make surfing poor
      Given the forecast for "Newquay, GB" is "calm and overcast" every day
      When I request rankings for location "Newquay, GB"
      Then I receive a valid ranking response
      And on day 1 the "Surfing" score is at most 39

  Rule: Outdoor sightseeing wants dry, clear and comfortable weather

    @smoke
    Scenario: Clear skies and 22°C make outdoor sightseeing the best option
      Given the forecast for "London, GB" is "clear and mild" every day
      When I request rankings for location "London, GB"
      Then I receive a valid ranking response
      And on every day "Outdoor Sightseeing" is ranked 1
      And on day 1 the reasoning for "Outdoor Sightseeing" mentions "clear"
      And on day 1 the reasoning for "Outdoor Sightseeing" mentions "22°C"

    Scenario Outline: Uncomfortable weather pushes outdoor sightseeing below indoor (<weather>)
      Given the forecast for "London, GB" is "<weather>" every day
      When I request rankings for location "London, GB"
      Then I receive a valid ranking response
      And on day 1 "Indoor Sightseeing" scores higher than "Outdoor Sightseeing"

      Examples:
        | weather          |
        | extreme heat     |
        | freezing and dry |
        | heavy rain       |

    @monotonicity
    Scenario: More rain never makes outdoor sightseeing more suitable
      Given the forecast for "London, GB" is "clear and mild" every day
      And on day 2 the forecast "precipitation" is 2
      And on day 3 the forecast "precipitation" is 8
      And on day 4 the forecast "precipitation" is 25
      When I request rankings for location "London, GB"
      Then I receive a valid ranking response
      And the "Outdoor Sightseeing" score does not increase across days 1 to 4

  Rule: Indoor sightseeing is the safe fallback in bad weather

    Scenario: Heavy rain makes indoor sightseeing the best option
      Given the forecast for "London, GB" is "heavy rain" every day
      When I request rankings for location "London, GB"
      Then I receive a valid ranking response
      And on every day "Indoor Sightseeing" is ranked 1
      And on day 1 the reasoning for "Indoor Sightseeing" mentions "rain"

    @policy
    Scenario: Indoor sightseeing is never worse than Fair because of weather
      Given the forecast for "Zermatt, CH" is "heavy snowfall" every day
      When I request rankings for location "Zermatt, CH"
      Then I receive a valid ranking response
      And on every day the "Indoor Sightseeing" score is at least 40

  Rule: Dangerous weather is flagged for all outdoor activities

    Scenario: A thunderstorm makes every outdoor activity unsuitable
      Given the forecast for "Newquay, GB" is "thunderstorm" every day
      When I request rankings for location "Newquay, GB"
      Then I receive a valid ranking response
      And on day 1 "Indoor Sightseeing" is ranked 1
      And on day 1 the "Skiing" suitability is "Unsuitable"
      And on day 1 the "Surfing" suitability is "Unsuitable"
      And on day 1 the "Outdoor Sightseeing" suitability is "Unsuitable"
      And on day 1 the reasoning for "Surfing" mentions "thunderstorm"
      And on day 1 the reasoning for "Skiing" mentions "thunderstorm"

    Scenario: Thunderstorm overrides heavy snow for skiing safety
      Given the forecast for "Zermatt, CH" is "heavy snowfall" every day
      And on day 1 the forecast "weather code" is 95
      When I request rankings for location "Zermatt, CH"
      Then I receive a valid ranking response
      And on day 1 the "Skiing" suitability is "Unsuitable"
      And on day 2 "Skiing" is ranked 1

  Rule: Each day is ranked independently on its own weather

    Scenario: A mixed week produces the expected winner on each of the 7 days
      Given the 7-day forecast for "Zermatt, CH" is:
        | day | weather           |
        | 1   | heavy snowfall    |
        | 2   | clear and mild    |
        | 3   | heavy rain        |
        | 4   | warm and windy    |
        | 5   | thunderstorm      |
        | 6   | light snow        |
        | 7   | calm and overcast |
      When I request rankings for location "Zermatt, CH"
      Then I receive a valid ranking response
      And the top-ranked activity per day is:
        # "reasoning mentions" is asserted: the winner's reasoning must contain it (case-insensitive).
        | day | activity            | reasoning mentions | why (documentation only)                         |
        | 1   | Skiing              | snow               | 25 cm fresh snow                                 |
        | 2   | Outdoor Sightseeing | clear              | clear, 22°C                                      |
        | 3   | Indoor Sightseeing  | rain               | 30 mm rain                                       |
        | 4   | Surfing             | wind               | 28 km/h wind, 24°C                               |
        | 5   | Indoor Sightseeing  | thunderstorm       | thunderstorm                                     |
        | 6   | Indoor Sightseeing  | snow               | 1 cm snow at 0°C: only Fair skiing, cold outside |
        | 7   | Outdoor Sightseeing | overcast           | dry, calm, 16°C                                  |

    Scenario: Identical input produces identical, repeatable rankings
      # Tie-break rule (contract): equal scores on a day are ordered alphabetically by activity.
      # No public input can GUARANTEE a tie without fixing the scoring formula, so this scenario
      # only proves repeatability; the tie-break is checked when a tie happens to occur and the
      # report attaches whether one was observed. It does not claim tie coverage otherwise.
      Given the forecast for "London, GB" is "calm and overcast" every day
      When I request rankings for location "London, GB" twice
      Then both ranking responses are valid and rank the activities identically
      And any activities with equal scores on the same day are ordered alphabetically
