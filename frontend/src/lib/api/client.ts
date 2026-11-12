/**
 * Data access layer: the only code that talks HTTP. Everything above it gets typed results or an `ApiError`.
 * Types come from the backend's OpenAPI schema (`npm run api:types`).
 */
import createClient from 'openapi-fetch';
import type { components, paths } from './schema';

export type Schemas = components['schemas'];

export const http = createClient<paths>({ baseUrl: '', credentials: 'include' });

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors: Record<string, string[]> = {},
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

type Result<T> = { data?: T; error?: unknown; response: Response };

/** Unwrap an openapi-fetch result: return the data, or throw the API's `{code, message, ...}` as an ApiError. */
export async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
  let result: Result<T>;
  try {
    result = await promise;
  } catch {
    throw new ApiError(0, 'network_error', "Can't reach the server. Check your connection and try again.");
  }
  if (result.response.ok) return result.data as T;
  const body = (result.error ?? {}) as Partial<Schemas['Error']>;
  throw new ApiError(
    result.response.status,
    body.code ?? 'http_error',
    body.message ?? `Something went wrong (HTTP ${result.response.status}).`,
    body.fieldErrors ?? {},
    (body.details as Record<string, unknown>) ?? {},
  );
}
