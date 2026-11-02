import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@mm/shared';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const COOKIE = process.env.SESSION_COOKIE_NAME ?? 'mm_sid';

/** Asks the API who the session cookie belongs to. The API is the only judge of a session. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const res = await fetch(`${API}/api/auth/me`, { headers: { cookie: `${COOKIE}=${token}` }, cache: 'no-store' });
  if (!res.ok) return null;
  return ((await res.json()) as { user: SessionUser }).user;
}

/** Where each role lands after signing in. */
export function homeFor(user: SessionUser) {
  if (user.role === 'admin') return '/admin';
  if (user.role === 'seller') return user.seller?.status === 'approved' ? '/seller' : '/seller/application';
  return '/account';
}

/** Server-side gate for a page: signed in, and (optionally) one of these roles. */
export async function requireUser(next: string, roles?: SessionUser['role'][]) {
  const user = await getSessionUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(next)}`);
  if (roles && !roles.includes(user.role)) redirect(homeFor(user));
  return user;
}
