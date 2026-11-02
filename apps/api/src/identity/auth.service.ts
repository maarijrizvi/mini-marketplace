import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { passwordProblems, type SessionUser } from '@mm/shared';
import { ApiError, fieldError } from '../common/http.js';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { Prisma } from '../generated/prisma/client.js';
import { AuditService } from '../platform/audit.service.js';
import { OutboxService } from '../platform/outbox.service.js';
import { PrismaService, type Tx } from '../platform/prisma.service.js';
import { burnPasswordCheck, codeHash, hashPassword, randomCode, randomToken, sha256, verifyPassword } from './secrets.js';
import { SessionsService } from './sessions.service.js';

export const MAX_FAILED_SIGN_INS = 5;
export const LOCK_MINUTES = 15;
export const CODE_TTL_HOURS = 24;
export const MAX_CODE_ATTEMPTS = 5;
export const RESEND_COOLDOWN_SECONDS = 60;
export const RESET_TTL_MINUTES = 30;

type NewAccount = { fullName: string; email: string; phone: string; password: string };
type ClientMeta = { userAgent?: string; ip?: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Creates an unverified customer and emails a six-digit code. */
  async signUp(input: NewAccount) {
    await this.assertFree(input);
    const passwordHash = await hashPassword(input.password);
    await this.unique(() =>
      this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email: input.email, phone: input.phone, fullName: input.fullName, passwordHash, role: 'customer' },
        });
        await this.audit.record(
          tx,
          { type: 'user', id: user.id },
          'user.registered',
          { type: 'user', id: user.id },
          { after: { role: 'customer' } },
        );
        await this.issueVerificationCode(tx, user);
      }),
    );
    return { email: input.email };
  }

  /**
   * Creates a separate seller login with a pending shop. If a customer is signed in, the shop is
   * linked to them so their account can show its status; they still sign in to it separately.
   */
  async registerSeller(input: NewAccount & { shopName: string; category: string; pickupAddress: string }, registeredBy?: SessionUser) {
    if (registeredBy && registeredBy.email === input.email) {
      throw fieldError(
        HttpStatus.CONFLICT,
        'email',
        'Your seller account needs a different email from your customer account.',
        'email_taken',
      );
    }
    if (registeredBy && registeredBy.phone === input.phone) {
      throw fieldError(
        HttpStatus.CONFLICT,
        'phone',
        'Your seller account needs a different phone number from your customer account.',
        'phone_taken',
      );
    }
    await this.assertFree(input);
    const shopNameKey = input.shopName.toLowerCase();
    if (await this.prisma.sellerAccount.findUnique({ where: { shopNameKey } })) {
      throw fieldError(HttpStatus.CONFLICT, 'shopName', 'Another shop already uses this name.', 'shop_name_taken');
    }
    const passwordHash = await hashPassword(input.password);
    await this.unique(() =>
      this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            phone: input.phone,
            fullName: input.fullName,
            passwordHash,
            role: 'seller',
            sellerAccount: {
              create: {
                shopName: input.shopName,
                shopNameKey,
                category: input.category,
                pickupAddress: input.pickupAddress,
                registeredByUserId: registeredBy?.role === 'customer' ? registeredBy.id : undefined,
              },
            },
          },
        });
        await this.audit.record(
          tx,
          { type: 'user', id: user.id },
          'seller.applied',
          { type: 'user', id: user.id },
          { after: { shopName: input.shopName, status: 'pending' } },
        );
        await this.issueVerificationCode(tx, user);
      }),
    );
    return { email: input.email };
  }

  /** Confirms the email code, activates the account and signs the user in. */
  async verifyEmail(email: string, code: string, meta: ClientMeta) {
    const user = await this.prisma.user.findUnique({ where: { email }, include: { sellerAccount: true } });
    if (!user) throw this.badCode();
    if (user.emailVerifiedAt)
      throw new ApiError(HttpStatus.CONFLICT, 'This email is already verified. Sign in instead.', { code: 'already_verified' });

    const token = await this.prisma.authToken.findFirst({
      where: { userId: user.id, kind: 'verify_email', usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!token || token.expiresAt <= new Date()) {
      throw new ApiError(HttpStatus.GONE, 'This code has expired. Send a new code.', { code: 'code_expired' });
    }
    if (token.attempts >= MAX_CODE_ATTEMPTS) {
      throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'Too many wrong codes. Send a new code to try again.', { code: 'code_locked' });
    }
    if (token.tokenHash !== codeHash(user.id, code)) {
      const updated = await this.prisma.authToken.update({ where: { id: token.id }, data: { attempts: { increment: 1 } } });
      const left = MAX_CODE_ATTEMPTS - updated.attempts;
      throw left > 0
        ? fieldError(HttpStatus.BAD_REQUEST, 'code', `That code isn’t right. ${left} ${left === 1 ? 'try' : 'tries'} left.`, 'code_wrong')
        : new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'Too many wrong codes. Send a new code to try again.', { code: 'code_locked' });
    }

    const sessionToken = await this.prisma.$transaction(async (tx) => {
      await tx.authToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
      await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      await this.audit.record(tx, { type: 'user', id: user.id }, 'user.email_verified', { type: 'user', id: user.id });
      if (user.sellerAccount) {
        await this.outbox.add(tx, { type: 'seller', id: user.sellerAccount.id }, 'identity.seller_applied', {
          userId: user.id,
          email: user.email,
          fullName: user.fullName,
          shopName: user.sellerAccount.shopName,
        });
      }
      return this.sessions.create(tx, user.id, meta);
    });
    return { sessionToken, user: await this.sessions.loadUser(user.id) };
  }

  /** Sends a fresh code. Always answers the same way, so it can't reveal which emails have accounts. */
  async resendCode(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerifiedAt) return;
    const last = await this.prisma.authToken.findFirst({
      where: { userId: user.id, kind: 'verify_email' },
      orderBy: { createdAt: 'desc' },
    });
    if (last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
      throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, `Wait a minute before asking for another code.`, { code: 'resend_too_soon' });
    }
    await this.prisma.$transaction((tx) => this.issueVerificationCode(tx, user));
  }

  async signIn(email: string, password: string, meta: ClientMeta) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      await burnPasswordCheck(password);
      throw this.badCredentials();
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ApiError(
        HttpStatus.LOCKED,
        `Too many attempts. Sign-in is paused for ${LOCK_MINUTES} minutes. You can reset your password now.`,
        { code: 'locked' },
      );
    }
    if (!(await verifyPassword(user.passwordHash, password))) {
      const failedLogins = user.failedLogins + 1;
      const lock = failedLogins >= MAX_FAILED_SIGN_INS;
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: lock ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLogins },
        });
        if (lock)
          await this.audit.record(
            tx,
            { type: 'system', id: 'identity.rate-limiter' },
            'user.locked',
            { type: 'user', id: user.id },
            { after: { minutes: LOCK_MINUTES } },
          );
      });
      if (lock)
        throw new ApiError(
          HttpStatus.LOCKED,
          `Too many attempts. Sign-in is paused for ${LOCK_MINUTES} minutes. You can reset your password now.`,
          { code: 'locked' },
        );
      const left = MAX_FAILED_SIGN_INS - failedLogins;
      throw this.badCredentials(left <= 3 ? `${left} ${left === 1 ? 'attempt' : 'attempts'} left before sign-in is paused.` : undefined);
    }
    if (user.status === 'suspended') {
      throw new ApiError(HttpStatus.FORBIDDEN, 'This account is suspended. Contact support if you think this is a mistake.', {
        code: 'suspended',
      });
    }
    if (!user.emailVerifiedAt) {
      throw new ApiError(HttpStatus.FORBIDDEN, 'Verify your email first. We sent a 6-digit code when you signed up.', {
        code: 'email_unverified',
      });
    }
    const sessionToken = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
      await this.audit.record(tx, { type: 'user', id: user.id }, 'user.signed_in', { type: 'user', id: user.id });
      return this.sessions.create(tx, user.id, meta);
    });
    return { sessionToken, user: await this.sessions.loadUser(user.id) };
  }

  async signOut(sessionId: string, userId: string) {
    await this.sessions.revoke(sessionId);
    await this.prisma.$transaction((tx) =>
      this.audit.record(tx, { type: 'user', id: userId }, 'user.signed_out', { type: 'user', id: userId }),
    );
  }

  /** Emails a reset link if the account exists. Same answer either way. */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;
    const token = randomToken();
    await this.prisma.$transaction(async (tx) => {
      await tx.authToken.updateMany({ where: { userId: user.id, kind: 'reset_password', usedAt: null }, data: { usedAt: new Date() } });
      await tx.authToken.create({
        data: {
          userId: user.id,
          kind: 'reset_password',
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
        },
      });
      await this.outbox.add(tx, { type: 'user', id: user.id }, 'identity.password_reset_requested', {
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        resetUrl: `${this.config.WEB_ORIGIN}/reset-password?token=${token}`,
      });
    });
  }

  /** Sets a new password from a reset link, unlocks the account and signs out every device. */
  async resetPassword(token: string, password: string) {
    const record = await this.prisma.authToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!record || record.kind !== 'reset_password')
      throw new ApiError(HttpStatus.GONE, 'This link isn’t valid. Request a new one.', { code: 'link_invalid' });
    if (record.usedAt) throw new ApiError(HttpStatus.GONE, 'This link was already used. Request a new one.', { code: 'link_used' });
    if (record.expiresAt <= new Date())
      throw new ApiError(HttpStatus.GONE, 'This link has expired. Request a new one.', { code: 'link_expired' });
    const problems = passwordProblems(password, record.user.email);
    if (problems.length)
      throw new ApiError(HttpStatus.BAD_REQUEST, 'Check the highlighted fields.', {
        code: 'validation_failed',
        fieldErrors: { password: problems },
      });
    if (await verifyPassword(record.user.passwordHash, password)) {
      throw fieldError(HttpStatus.BAD_REQUEST, 'password', 'Choose a password you haven’t used for this account.', 'password_reused');
    }
    const passwordHash = await hashPassword(password);
    await this.prisma.$transaction(async (tx) => {
      await tx.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash, failedLogins: 0, lockedUntil: null } });
      await this.sessions.revokeAllForUser(tx, record.userId);
      await this.audit.record(
        tx,
        { type: 'user', id: record.userId },
        'user.password_reset',
        { type: 'user', id: record.userId },
        { after: { sessions: 'all revoked' } },
      );
      await this.outbox.add(tx, { type: 'user', id: record.userId }, 'identity.password_changed', {
        userId: record.userId,
        email: record.user.email,
        fullName: record.user.fullName,
      });
    });
  }

  private async issueVerificationCode(tx: Tx, user: { id: string; email: string; fullName: string }) {
    const code = randomCode();
    await tx.authToken.updateMany({ where: { userId: user.id, kind: 'verify_email', usedAt: null }, data: { usedAt: new Date() } });
    await tx.authToken.create({
      data: {
        userId: user.id,
        kind: 'verify_email',
        tokenHash: codeHash(user.id, code),
        expiresAt: new Date(Date.now() + CODE_TTL_HOURS * 3600_000),
      },
    });
    await this.outbox.add(tx, { type: 'user', id: user.id }, 'identity.email_verification_requested', {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      code,
    });
  }

  private async assertFree(input: { email: string; phone: string }) {
    const [byEmail, byPhone] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { phone: input.phone }, select: { id: true } }),
    ]);
    if (byEmail) throw fieldError(HttpStatus.CONFLICT, 'email', 'An account already uses this email.', 'email_taken');
    if (byPhone) throw fieldError(HttpStatus.CONFLICT, 'phone', 'An account already uses this phone number.', 'phone_taken');
  }

  /** Two requests can pass the checks at the same moment; the unique index decides, and we report it the same way. */
  private async unique<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const detail = JSON.stringify(e.meta ?? {}) + e.message;
        if (detail.includes('phone'))
          throw fieldError(HttpStatus.CONFLICT, 'phone', 'An account already uses this phone number.', 'phone_taken');
        if (detail.includes('shop_name'))
          throw fieldError(HttpStatus.CONFLICT, 'shopName', 'Another shop already uses this name.', 'shop_name_taken');
        throw fieldError(HttpStatus.CONFLICT, 'email', 'An account already uses this email.', 'email_taken');
      }
      throw e;
    }
  }

  private badCredentials(hint?: string) {
    return new ApiError(
      HttpStatus.UNAUTHORIZED,
      hint ? `That email and password don’t match. ${hint}` : 'That email and password don’t match.',
      { code: 'bad_credentials' },
    );
  }

  private badCode() {
    return fieldError(HttpStatus.BAD_REQUEST, 'code', 'That code isn’t right.', 'code_wrong');
  }
}
