import 'server-only';
import { cookies } from 'next/headers';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const COOKIE = process.env.SESSION_COOKIE_NAME ?? 'mm_sid';

/** Server-side GET to the API, forwarding the session cookie. Returns null on an error status or if the API is unreachable. */
export async function serverGet<T>(path: string): Promise<T | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  const res = await fetch(`${API}/api${path}`, {
    headers: token ? { cookie: `${COOKIE}=${token}` } : {},
    cache: 'no-store',
  }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json()) as T;
}
