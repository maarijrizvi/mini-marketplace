/** Error body from the API: { message, code?, fieldErrors? } */
export interface ApiProblem {
  status: number;
  message: string;
  code?: string;
  fieldErrors: Record<string, string[]>;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; problem: ApiProblem };

/** Browser-side call to the API through the /api rewrite, so the session cookie is sent. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'same-origin',
    });
  } catch {
    return {
      ok: false,
      problem: { status: 0, message: 'We couldn’t reach the server. Check your connection and try again.', fieldErrors: {} },
    };
  }
  if (res.ok) {
    const text = await res.text();
    return { ok: true, data: (text ? JSON.parse(text) : {}) as T };
  }
  const body = (await res.json().catch(() => ({}))) as Partial<ApiProblem>;
  return {
    ok: false,
    problem: {
      status: res.status,
      message: body.message ?? 'Something went wrong. Try again.',
      code: body.code,
      fieldErrors: body.fieldErrors ?? {},
    },
  };
}
