import { CanActivate, createParamDecorator, ExecutionContext, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role, SessionUser } from '@mm/shared';
import { ApiError } from '../common/http.js';
import { SessionsService } from './sessions.service.js';

const PUBLIC = 'mm:public';
const ROLES = 'mm:roles';

/** Route works without a session (a session is still read if present). */
export const Public = () => SetMetadata(PUBLIC, true);

/** Route needs one of these roles. Checked on the server; hiding a button in the UI is not enough. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export interface AuthedRequest extends Request {
  user?: SessionUser;
  sessionId?: string;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().user);

/**
 * Global guard: every route needs a valid session unless marked @Public(),
 * and @Roles() routes also need the right role.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token: string | undefined = req.cookies?.[this.sessions.cookieName];
    if (token) {
      const resolved = await this.sessions.resolve(token);
      if (resolved) {
        req.user = resolved.user;
        req.sessionId = resolved.sessionId;
      }
    }

    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;
    if (!req.user) throw new ApiError(HttpStatus.UNAUTHORIZED, 'Please sign in.', { code: 'unauthenticated' });

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (roles && !roles.includes(req.user.role)) {
      throw new ApiError(HttpStatus.FORBIDDEN, 'You don’t have access to this.', { code: 'forbidden' });
    }
    return true;
  }
}
