import assert from 'node:assert/strict';
import { ApiResponse, excerpt } from '../client/apiClient';
import { ResponseKind, VALIDATORS } from '../validation/contractValidators';

/**
 * Failure categories, used as message prefixes so tooling (scripts/verify-red-state.mjs) can
 * tell WHY a scenario failed, not just that it failed.
 */
export const FAILURE = {
  NON_JSON: '[NON_JSON_RESPONSE]',
  STATUS: '[STATUS_MISMATCH]',
  CONTRACT: '[CONTRACT_VIOLATION]',
} as const;

/**
 * The single gate every response assertion goes through, checked FIRST: an
 * application/json content type and a parseable JSON object. Otherwise it fails with a
 * bounded excerpt of what was actually received (HTML page, empty body, ...).
 */
export function jsonObjectBody(res: ApiResponse | undefined): Record<string, unknown> {
  assert.ok(res, 'No response captured: did the When step run?');
  assert.match(
    res.contentType,
    /^application\/json\b/i,
    `${FAILURE.NON_JSON} Expected Content-Type application/json, got "${res.contentType}" (HTTP ${res.status}). Excerpt: ${excerpt(res.rawBody)}`,
  );
  assert.ok(!res.parseError, `${FAILURE.NON_JSON} HTTP ${res.status}: ${res.parseError}`);
  assert.ok(
    typeof res.body === 'object' && res.body !== null && !Array.isArray(res.body),
    `${FAILURE.NON_JSON} Expected a JSON object body (HTTP ${res.status}). Excerpt: ${excerpt(res.rawBody)}`,
  );
  return res.body as Record<string, unknown>;
}

/** Content-type gate, then status precondition, then runtime contract validation. */
export function assertValidResponse(res: ApiResponse | undefined, status: number, kind: ResponseKind): void {
  const body = jsonObjectBody(res);
  assert.equal(
    res!.status,
    status,
    `${FAILURE.STATUS} Expected HTTP ${status}, got ${res!.status}. Excerpt: ${excerpt(res!.rawBody)}`,
  );
  const problems = VALIDATORS[kind](body);
  assert.deepEqual(
    problems,
    [],
    `${FAILURE.CONTRACT} Response is not a valid ${kind} response:\n  - ${problems.join('\n  - ')}`,
  );
}

export function assertError(res: ApiResponse | undefined, status: number, code: string): void {
  assertValidResponse(res, status, 'error');
  const error = (res!.body as { error: { code: string } }).error;
  assert.equal(error.code, code, `${FAILURE.CONTRACT} Expected error code ${code}, got ${error.code}`);
}
