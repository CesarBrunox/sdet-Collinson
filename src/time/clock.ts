/**
 * Explicit time reference for the "next 7 days" horizon.
 *
 * Clock contract: the API under test reads CLOCK_NOW (an ISO 8601 instant) when it is set
 * and treats it as "now". The suite exposes the same instant as REFERENCE_NOW, so both sides
 * agree on "today" without depending on the wall clock. The horizon is then
 *   [local date of REFERENCE_NOW in the location's time zone, + 6 days].
 * The default instant (22:30 UTC) is deliberately chosen so the local date differs between
 * time zones (e.g. 2 Nov in London, 3 Nov in Auckland).
 */
import { config } from '../config';
import { addDays } from '../fixtures/weather';

export function referenceNow(): Date {
  const d = new Date(config.referenceNow);
  if (Number.isNaN(d.getTime()))
    throw new Error(`REFERENCE_NOW "${config.referenceNow}" is not an ISO instant`);
  return d;
}

/** The calendar date (yyyy-mm-dd) of `instant` in IANA time zone `timeZone`. */
export function localDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(instant)
    .reduce<Record<string, string>>((acc, p) => ((acc[p.type] = p.value), acc), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** The 7 dates of the horizon for a location, relative to the reference instant. */
export function horizonFor(timeZone: string, now: Date = referenceNow()): string[] {
  const first = localDate(now, timeZone);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

let supportedZones: Set<string> | undefined | null;

/**
 * True for an IANA time zone this runtime knows, checked with the same Intl infrastructure the
 * horizon helpers use: Intl.DateTimeFormat must accept it (in a try block), and, when the
 * runtime exposes Intl.supportedValuesOf('timeZone'), it must be listed there or be an alias
 * that Intl canonicalises to a listed zone (e.g. "Asia/Calcutta" -> "Asia/Kolkata"), or "UTC".
 * Never throws.
 */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.trim() === '' || tz !== tz.trim()) return false;
  let resolved: string;
  try {
    resolved = new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return false;
  }
  if (supportedZones === undefined) {
    const sv = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    try {
      supportedZones = typeof sv === 'function' ? new Set(sv('timeZone')) : null;
    } catch {
      supportedZones = null;
    }
  }
  if (supportedZones === null) return true;
  return supportedZones.has(tz) || supportedZones.has(resolved) || /^(Etc\/)?UTC$/.test(resolved);
}
