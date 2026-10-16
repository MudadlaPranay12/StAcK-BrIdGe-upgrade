// Typed fetch client for the Northstar API.
//
// `apiRequest` throws a structured ApiError on any non-2xx response so views can
// render precise feedback. `rawRequest` never throws on HTTP status and is used
// by the Debug Lab, which must display the exact status code and body.

export interface ApiMeta {
  correlationId: string | null;
  traceId: string | null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly correlationId: string | null;
  readonly traceId: string | null;

  constructor(
    message: string,
    init: { status: number; code?: string; details?: unknown; correlationId?: string | null; traceId?: string | null }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code ?? 'ERROR';
    this.details = init.details;
    this.correlationId = init.correlationId ?? null;
    this.traceId = init.traceId ?? null;
  }

  /** Field-level validation messages, when the API returned a details array. */
  get fieldIssues(): Array<{ field: string; message: string }> {
    if (!Array.isArray(this.details)) return [];
    return this.details
      .filter((entry): entry is { field?: unknown; message?: unknown } => Boolean(entry) && typeof entry === 'object')
      .map((entry) => ({ field: String(entry.field ?? ''), message: String(entry.message ?? '') }))
      .filter((entry) => entry.field);
  }

  isNetworkError(): boolean {
    return this.status === 0;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface RawResult {
  ok: boolean;
  status: number;
  statusText: string;
  body: any;
  text: string;
  headers: Headers | null;
  durationMs: number;
  networkError: string | null;
  meta: ApiMeta;
}

function readMeta(body: any, headers: Headers | null): ApiMeta {
  const headerCorrelation = headers?.get('x-correlation-id') ?? null;
  const headerTrace = headers?.get('x-devbridge-trace-id') ?? null;
  return {
    correlationId: (body && typeof body === 'object' && typeof body.correlationId === 'string' ? body.correlationId : null) ?? headerCorrelation,
    traceId: (body && typeof body === 'object' && typeof body.traceId === 'string' ? body.traceId : null) ?? headerTrace,
  };
}

function parseBody(text: string): any {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function rawRequest(path: string, options: RequestOptions = {}): Promise<RawResult> {
  const started = performance.now();
  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers ?? {}),
    },
    signal: options.signal,
  };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);

  try {
    const response = await fetch(path, init);
    const text = await response.text();
    const body = parseBody(text);
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      body,
      text,
      headers: response.headers,
      durationMs: Math.round(performance.now() - started),
      networkError: null,
      meta: readMeta(body, response.headers),
    };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    const message = aborted
      ? 'The request was aborted by the client before the server responded.'
      : error instanceof Error
        ? error.message
        : 'Unknown network failure.';
    return {
      ok: false,
      status: 0,
      statusText: aborted ? 'Aborted' : 'Network error',
      body: null,
      text: '',
      headers: null,
      durationMs: Math.round(performance.now() - started),
      networkError: message,
      meta: { correlationId: null, traceId: null },
    };
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const result = await rawRequest(path, options);

  if (result.networkError) {
    throw new ApiError(result.networkError, { status: 0, code: 'NETWORK_ERROR' });
  }
  if (!result.ok) {
    const message =
      (result.body && typeof result.body === 'object' && typeof result.body.error === 'string' && result.body.error) ||
      `Request failed with HTTP ${result.status}.`;
    const code =
      (result.body && typeof result.body === 'object' && typeof result.body.code === 'string' && result.body.code) ||
      'HTTP_ERROR';
    const details = result.body && typeof result.body === 'object' ? result.body.details : undefined;
    throw new ApiError(message, {
      status: result.status,
      code,
      details,
      correlationId: result.meta.correlationId,
      traceId: result.meta.traceId,
    });
  }

  return result.body as T;
}
