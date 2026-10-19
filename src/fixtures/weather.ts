/**
 * Builders for Open-Meteo-shaped payloads. Field names follow the public Open-Meteo API
 * (https://open-meteo.com/en/docs and /en/docs/geocoding-api) so fixtures stay realistic.
 */

export interface DayWeather {
  weatherCode: number; // WMO code: 0 clear, 1-3 cloudy, 61-65 rain, 71-75 snow, 95-99 thunderstorm
  tempMax: number; // °C
  tempMin: number; // °C
  precipitation: number; // mm
  rain: number; // mm
  snowfall: number; // cm
  windSpeedMax: number; // km/h
  windGustsMax: number; // km/h
  precipitationProbability: number; // %
}

/** Named weather profiles used in the feature files ("a clear warm day", ...). */
export const WEATHER_PROFILES: Record<string, DayWeather> = {
  'clear and mild': w({ weatherCode: 0, tempMax: 22, tempMin: 14 }),
  'heavy snowfall': w({
    weatherCode: 75,
    tempMax: -3,
    tempMin: -9,
    precipitation: 18,
    snowfall: 25,
    windSpeedMax: 15,
  }),
  'light snow': w({ weatherCode: 71, tempMax: 0, tempMin: -4, precipitation: 1, snowfall: 1 }),
  'warm and windy': w({ weatherCode: 1, tempMax: 24, tempMin: 18, windSpeedMax: 28, windGustsMax: 40 }),
  'heavy rain': w({
    weatherCode: 65,
    tempMax: 13,
    tempMin: 9,
    precipitation: 30,
    rain: 30,
    precipitationProbability: 100,
  }),
  thunderstorm: w({
    weatherCode: 95,
    tempMax: 26,
    tempMin: 20,
    precipitation: 15,
    rain: 15,
    windSpeedMax: 45,
    windGustsMax: 80,
    precipitationProbability: 90,
  }),
  'calm and overcast': w({ weatherCode: 3, tempMax: 16, tempMin: 10, windSpeedMax: 5 }),
  'extreme heat': w({ weatherCode: 0, tempMax: 41, tempMin: 29 }),
  'freezing and dry': w({ weatherCode: 0, tempMax: -12, tempMin: -20 }),
};

function w(partial: Partial<DayWeather>): DayWeather {
  return {
    weatherCode: 0,
    tempMax: 20,
    tempMin: 12,
    precipitation: 0,
    rain: 0,
    snowfall: 0,
    windSpeedMax: 10,
    windGustsMax: 15,
    precipitationProbability: 0,
    ...partial,
  };
}

export function profile(name: string): DayWeather {
  const p = WEATHER_PROFILES[name];
  if (!p)
    throw new Error(`Unknown weather profile "${name}". Known: ${Object.keys(WEATHER_PROFILES).join(', ')}`);
  return { ...p };
}

export function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface ForecastOptions {
  startDate: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

/** Build an Open-Meteo /v1/forecast response with one entry per supplied day. */
export function forecastPayload(days: DayWeather[], opts: ForecastOptions) {
  return {
    latitude: opts.latitude,
    longitude: opts.longitude,
    timezone: opts.timezone,
    daily_units: {
      time: 'iso8601',
      weather_code: 'wmo code',
      temperature_2m_max: '°C',
      temperature_2m_min: '°C',
      precipitation_sum: 'mm',
      rain_sum: 'mm',
      snowfall_sum: 'cm',
      wind_speed_10m_max: 'km/h',
      wind_gusts_10m_max: 'km/h',
      precipitation_probability_max: '%',
    },
    daily: {
      time: days.map((_, i) => addDays(opts.startDate, i)),
      weather_code: days.map((d) => d.weatherCode),
      temperature_2m_max: days.map((d) => d.tempMax),
      temperature_2m_min: days.map((d) => d.tempMin),
      precipitation_sum: days.map((d) => d.precipitation),
      rain_sum: days.map((d) => d.rain),
      snowfall_sum: days.map((d) => d.snowfall),
      wind_speed_10m_max: days.map((d) => d.windSpeedMax),
      wind_gusts_10m_max: days.map((d) => d.windGustsMax),
      precipitation_probability_max: days.map((d) => d.precipitationProbability),
    },
  };
}

export interface GeoPlace {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  country_code: string;
  admin1?: string;
  timezone: string;
  population?: number;
}

/** A small gazetteer used to prime the geocoding stub. */
export const PLACES: Record<string, GeoPlace> = {
  'London, GB': {
    id: 2643743,
    name: 'London',
    latitude: 51.50853,
    longitude: -0.12574,
    country: 'United Kingdom',
    country_code: 'GB',
    admin1: 'England',
    timezone: 'Europe/London',
    population: 8961989,
  },
  'London, CA': {
    id: 6058560,
    name: 'London',
    latitude: 42.98339,
    longitude: -81.23304,
    country: 'Canada',
    country_code: 'CA',
    admin1: 'Ontario',
    timezone: 'America/Toronto',
    population: 346765,
  },
  'Londonderry, GB': {
    id: 2643736,
    name: 'Londonderry',
    latitude: 54.9981,
    longitude: -7.30934,
    country: 'United Kingdom',
    country_code: 'GB',
    admin1: 'Northern Ireland',
    timezone: 'Europe/London',
    population: 83652,
  },
  'Zermatt, CH': {
    id: 2657928,
    name: 'Zermatt',
    latitude: 46.02126,
    longitude: 7.74912,
    country: 'Switzerland',
    country_code: 'CH',
    admin1: 'Valais',
    timezone: 'Europe/Zurich',
    population: 5643,
  },
  'Newquay, GB': {
    id: 2641589,
    name: 'Newquay',
    latitude: 50.41557,
    longitude: -5.07319,
    country: 'United Kingdom',
    country_code: 'GB',
    admin1: 'England',
    timezone: 'Europe/London',
    population: 20342,
  },
  'São Paulo, BR': {
    id: 3448439,
    name: 'São Paulo',
    latitude: -23.5475,
    longitude: -46.63611,
    country: 'Brazil',
    country_code: 'BR',
    admin1: 'São Paulo',
    timezone: 'America/Sao_Paulo',
    population: 10021295,
  },
  'Auckland, NZ': {
    id: 2193733,
    name: 'Auckland',
    latitude: -36.84853,
    longitude: 174.76349,
    country: 'New Zealand',
    country_code: 'NZ',
    admin1: 'Auckland',
    timezone: 'Pacific/Auckland',
    population: 417910,
  },
};

export function place(key: string): GeoPlace {
  const p = PLACES[key];
  if (!p) throw new Error(`Unknown place "${key}". Known: ${Object.keys(PLACES).join(', ')}`);
  return p;
}

/**
 * Apply a single-variable override while keeping the day physically coherent
 * (e.g. adding rain to a "clear" day also turns its WMO weather code into rain).
 */
export function applyOverride(day: DayWeather, field: string, value: number): void {
  switch (field) {
    case 'precipitation':
    case 'rain':
      day.precipitation = value;
      day.rain = value;
      day.precipitationProbability = value > 0 ? Math.max(day.precipitationProbability, 80) : 0;
      if (value > 0) day.weatherCode = value >= 7.6 ? 65 : value >= 2.5 ? 63 : 61;
      break;
    case 'snowfall':
      day.snowfall = value;
      day.precipitation = Number((value * 0.7).toFixed(1)); // ~1 cm snow ≈ 0.7 mm water
      if (value > 0) day.weatherCode = value >= 5 ? 75 : 71;
      break;
    case 'max temperature':
      day.tempMax = value;
      day.tempMin = Math.min(day.tempMin, value - 5);
      break;
    case 'wind speed':
      day.windSpeedMax = value;
      day.windGustsMax = Math.max(day.windGustsMax, Math.round(value * 1.4));
      break;
    case 'weather code':
      day.weatherCode = value;
      break;
    default:
      throw new Error(`Unsupported forecast override "${field}"`);
  }
}

/**
 * Twelve same-name US towns (synthetic ids/coordinates, realistic states) used to prove the
 * suggestion list is capped at 10 and keeps provider order. Keys: "Springfield, <state>".
 */
const SPRINGFIELD_STATES: Array<[string, number, number, string]> = [
  ['Illinois', 39.80172, -89.64371, 'America/Chicago'],
  ['Missouri', 37.21533, -93.29824, 'America/Chicago'],
  ['Massachusetts', 42.10148, -72.58981, 'America/New_York'],
  ['Ohio', 39.92423, -83.80882, 'America/New_York'],
  ['Oregon', 44.04624, -123.02203, 'America/Los_Angeles'],
  ['Tennessee', 36.50921, -86.885, 'America/Chicago'],
  ['Vermont', 43.29841, -72.48231, 'America/New_York'],
  ['Virginia', 38.78928, -77.1872, 'America/New_York'],
  ['New Jersey', 40.70488, -74.31709, 'America/New_York'],
  ['Kentucky', 37.68534, -85.22218, 'America/New_York'],
  ['Georgia', 32.3699, -81.31122, 'America/New_York'],
  ['Colorado', 37.40835, -102.61435, 'America/Denver'],
];
SPRINGFIELD_STATES.forEach(([state, latitude, longitude, timezone], i) => {
  PLACES[`Springfield, ${state}`] = {
    id: 4250000 + i,
    name: 'Springfield',
    latitude,
    longitude,
    country: 'United States',
    country_code: 'US',
    admin1: state,
    timezone,
  };
});
export const SPRINGFIELD_KEYS = SPRINGFIELD_STATES.map(([state]) => `Springfield, ${state}`);

/** Daily variables the contract requires for ranking; the rest of the payload is optional. */
export const REQUIRED_DAILY_FIELDS = [
  'time',
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'snowfall_sum',
  'wind_speed_10m_max',
] as const;
export const OPTIONAL_DAILY_FIELDS = [
  'rain_sum',
  'wind_gusts_10m_max',
  'precipitation_probability_max',
] as const;

/** A real 2-letter town name, for Open-Meteo's "two characters match an exact name" rule. */
PLACES['Ii, FI'] = {
  id: 656851,
  name: 'Ii',
  latitude: 65.31735,
  longitude: 25.3731,
  country: 'Finland',
  country_code: 'FI',
  admin1: 'North Ostrobothnia',
  timezone: 'Europe/Helsinki',
  population: 9800,
};

/** A place without admin1: Open-Meteo omits empty fields, so the API's optional `region` must be absent. */
PLACES['Vatican City, VA'] = {
  id: 6691831,
  name: 'Vatican City',
  latitude: 41.90268,
  longitude: 12.45414,
  country: 'Vatican City',
  country_code: 'VA',
  timezone: 'Europe/Vatican',
};
/** Every optional part of the forecast payload: optional daily arrays plus the units block. */
export const OPTIONAL_FORECAST_FIELDS = [...OPTIONAL_DAILY_FIELDS, 'daily_units'] as const;
