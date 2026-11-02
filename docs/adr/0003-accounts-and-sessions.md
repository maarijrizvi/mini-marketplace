# 3. Accounts, sessions and roles

Date: 2026-11-02 · Status: accepted

- **One user table, three roles** (`customer`, `seller`, `admin`). A seller is a separate login with its own email and phone, plus a `seller_accounts` row. A customer who registers a shop is linked through `seller_accounts.registered_by_user_id` so their account can show the shop’s status; they still sign in to the seller account separately.
- **Email verification.** Accounts start unverified and can’t sign in. A 6-digit code (stored as `sha256(user_id:code)`) expires in 24 hours, allows 5 wrong tries, and can be resent once a minute.
- **Sessions.** A random 32-byte token in an `HttpOnly`, `SameSite=Lax` cookie; the `sessions` table stores its SHA-256. Sessions are checked on every request, so sign-out, password reset and suspension take effect immediately.
- **Brute force.** Five wrong passwords pause sign-in for 15 minutes (`users.locked_until`). Unknown emails take as long as wrong passwords and get the same message.
- **Password reset.** One-time link, 30 minutes, same answer whether or not the email exists. Resetting unlocks the account, revokes every session and emails a notice.
- **Authorisation.** A global guard requires a session unless a route is marked `@Public()`; `@Roles()` restricts by role. The web app’s checks are for navigation only; the API is the authority.
- **Audit.** Sign-ups, verification, sign-ins, lockouts, sign-outs and resets are written to `audit_log` in the same transaction as the change.

Not yet: admin two-step sign-in (TOTP, `users.mfa_secret`), rate limiting by IP. Both are planned with the admin milestone.
