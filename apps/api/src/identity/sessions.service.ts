import { Inject, Injectable } from '@nestjs/common';
import type { Response } from 'express';
import type { SessionUser } from '@mm/shared';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { PrismaService, type Tx } from '../platform/prisma.service.js';
import { randomToken, sha256 } from './secrets.js';

/** Refresh last_seen_at at most this often, so every request doesn't write to the database. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
  status: true,
  sellerAccount: { select: { shopName: true, status: true } },
} as const;

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Creates a session and returns the raw token for the cookie. Only its hash is stored. */
  async create(tx: Tx, userId: string, meta: { userAgent?: string; ip?: string }) {
    const token = randomToken();
    await tx.session.create({
      data: {
        userId,
        tokenHash: sha256(token),
        userAgent: meta.userAgent?.slice(0, 300),
        ip: meta.ip,
        expiresAt: new Date(Date.now() + this.config.SESSION_TTL_HOURS * 3600_000),
      },
    });
    return token;
  }

  /** Looks up a live session for a cookie value; returns null for unknown, expired, revoked or suspended. */
  async resolve(token: string): Promise<{ sessionId: string; user: SessionUser } | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { select: userSelect } },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== 'active') return null;
    if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    }
    return { sessionId: session.id, user: toSessionUser(session.user) };
  }

  revoke(sessionId: string) {
    return this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  revokeAllForUser(tx: Tx, userId: string) {
    return tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  setCookie(res: Response, token: string) {
    res.cookie(this.config.SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: this.config.SESSION_TTL_HOURS * 3600_000,
    });
  }

  clearCookie(res: Response) {
    res.clearCookie(this.config.SESSION_COOKIE_NAME, { path: '/' });
  }

  get cookieName() {
    return this.config.SESSION_COOKIE_NAME;
  }

  async loadUser(userId: string): Promise<SessionUser> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: userSelect });
    return toSessionUser(user);
  }
}

function toSessionUser(u: {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: SessionUser['role'];
  sellerAccount: { shopName: string; status: NonNullable<SessionUser['seller']>['status'] } | null;
}): SessionUser {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    phone: u.phone,
    role: u.role,
    seller: u.sellerAccount ? { shopName: u.sellerAccount.shopName, status: u.sellerAccount.status } : null,
  };
}
