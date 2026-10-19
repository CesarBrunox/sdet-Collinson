import { config } from '../config';

export interface ApiResponse<T = unknown> {
  status: number;
  headers: Headers;
  /** Parsed JSON, or `undefined` when the body is empty or not valid JSON (see `parseError`). */
  body: T;
  rawBody: string;
  contentType: string;
  /** Set when a non-empty body could not be parsed as JSON. */
  parseError?: string;
  durationMs: number;
}

const EXCERPT_CHARS = 300;

/** Bounded, single-line excerpt of a body for diagnostics. */
export function excerpt(raw: string, max = EXCERPT_CHARS): string {
  const flat = raw.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}… (${raw.length} chars)` : flat;
}

/** Transport-level failure: no HTTP response was received at all. */
export class SutTransportError extends Error {
  constructor(
    readonly kind: 'CONNECTION_REFUSED' | 'TIMEOUT' | 'NETWORK',
    readonly url: string,
    detail: string,
  ) {
    super(`[${kind}] ${detail} (${url})`);
    this.name = 'SutTransportError';
  }
}

/**
 * Nothing is listening at the configured address. Before an implementation exists this is
 * the expected red state of the spec-first suite.
 */
export class SutUnavailableError extends SutTransportError {
  constructor(url: string, cause: string) {
    super(
      'CONNECTION_REFUSED',
      url,
      `Activity Ranking API is not reachable: connection refused. This is the expected red state until the ` +
        `API is implemented; set API_BASE_URL to point at it. Cause: ${cause}`,
    );
    this.name = 'SutUnavailableError';
  }
}

/** Something accepted the connection but did not answer within the client timeout. */
export class SutTimeoutError extends SutTransportError {
  constructor(url: string, timeoutMs: number, phase: 'connect' | 'body' = 'connect') {
    super(
      'TIMEOUT',
      url,
      phase === 'body'
        ? `Headers received but the body did not complete within the client timeout of ${timeoutMs} ms`
        : `No response within the client timeout of ${timeoutMs} ms`,
    );
    this.name = 'SutTimeoutError';
  }
}

function causeCode(err: unknown): string {
  const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
  return cause?.code ?? cause?.message ?? String(err);
}

/** Thin HTTP client for the system under test. Keeps transport details out of step definitions. */
export class ActivityRankingClient {
  constructor(
    private readonly baseUrl: string = config.apiBaseUrl,
    private readonly timeoutMs: number = config.timeoutMs,
  ) {}

  searchLocations(query: string | undefined): Promise<ApiResponse> {
    return this.get('/api/v1/locations', query === undefined ? {} : { query });
  }

  getRankings(params: Record<string, string>): Promise<ApiResponse> {
    return this.get('/api/v1/rankings', params);
  }

  async get(path: string, params: Record<string, string> = {}): Promise<ApiResponse> {
    const url = new URL(path, this.baseUrl);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const started = Date.now();
    // One signal bounds the WHOLE exchange: connecting, receiving headers AND reading the body.
    // A server that sends headers and then stalls the body is still classified as TIMEOUT.
    const signal = AbortSignal.timeout(this.timeoutMs);
    let res: Response;
    let rawBody: string;
    let phase: 'connect' | 'body' = 'connect';
    try {
      res = await fetch(url, { headers: { Accept: 'application/json' }, signal });
      phase = 'body';
      rawBody = await res.text();
    } catch (err) {
      throw this.classify(err, url.toString(), phase, signal);
    }
    let body: unknown;
    let parseError: string | undefined;
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch (err) {
        parseError = `Body is not valid JSON (${(err as Error).message}). Excerpt: ${excerpt(rawBody)}`;
      }
    }
    return {
      status: res.status,
      headers: res.headers,
      body,
      rawBody,
      contentType: res.headers.get('content-type') ?? '',
      parseError,
      durationMs: Date.now() - started,
    };
  }

  private classify(
    err: unknown,
    url: string,
    phase: 'connect' | 'body',
    signal: AbortSignal,
  ): SutTransportError {
    const name = (err as Error)?.name;
    if (signal.aborted || name === 'TimeoutError' || name === 'AbortError')
      return new SutTimeoutError(url, this.timeoutMs, phase);
    const code = causeCode(err);
    if (phase === 'connect' && code === 'ECONNREFUSED') return new SutUnavailableError(url, code);
    return new SutTransportError(
      'NETWORK',
      url,
      `Network error while ${phase === 'body' ? 'reading the body' : 'connecting'}: ${code}`,
    );
  }
}
