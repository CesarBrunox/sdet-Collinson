/** Central runtime configuration, driven by environment variables (see .env.example). */
export const config = {
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',
  stubPort: Number(process.env.OPEN_METEO_STUB_PORT ?? 4010),
  timeoutMs: Number(process.env.API_TIMEOUT_MS ?? 5000),
  /** Reference "now", used only for the 7-day horizon; start the API with CLOCK_NOW = this. */
  referenceNow: process.env.REFERENCE_NOW ?? '2026-11-02T22:30:00Z',
} as const;
