import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  forgotPasswordSchema,
  resendCodeSchema,
  resetPasswordSchema,
  sellerRegisterSchema,
  signInSchema,
  signUpSchema,
  verifyEmailSchema,
  type SessionUser,
} from '@mm/shared';
import type { z } from 'zod';
import { ZodBody } from '../common/http.js';
import { type AuthedRequest, CurrentUser, Public } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { SessionsService } from './sessions.service.js';

const meta = (req: AuthedRequest) => ({ userAgent: req.get('user-agent'), ip: req.ip });

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
  ) {}

  @Public()
  @Post('signup')
  signUp(@Body(new ZodBody(signUpSchema)) body: z.output<typeof signUpSchema>) {
    return this.auth.signUp(body);
  }

  @Public()
  @Post('seller-signup')
  registerSeller(@Body(new ZodBody(sellerRegisterSchema)) body: z.output<typeof sellerRegisterSchema>, @CurrentUser() user?: SessionUser) {
    return this.auth.registerSeller(body, user);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(
    @Body(new ZodBody(verifyEmailSchema)) body: z.output<typeof verifyEmailSchema>,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { sessionToken, user } = await this.auth.verifyEmail(body.email, body.code, meta(req));
    this.sessions.setCookie(res, sessionToken);
    return { user };
  }

  @Public()
  @Post('resend-code')
  @HttpCode(202)
  async resendCode(@Body(new ZodBody(resendCodeSchema)) body: z.output<typeof resendCodeSchema>) {
    await this.auth.resendCode(body.email);
    return { ok: true };
  }

  @Public()
  @Post('signin')
  @HttpCode(200)
  async signIn(
    @Body(new ZodBody(signInSchema)) body: z.output<typeof signInSchema>,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { sessionToken, user } = await this.auth.signIn(body.email, body.password, meta(req));
    this.sessions.setCookie(res, sessionToken);
    return { user };
  }

  @Post('signout')
  @HttpCode(204)
  async signOut(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.signOut(req.sessionId!, req.user!.id);
    this.sessions.clearCookie(res);
  }

  @Get('me')
  me(@CurrentUser() user: SessionUser) {
    return { user };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(202)
  async forgotPassword(@Body(new ZodBody(forgotPasswordSchema)) body: z.output<typeof forgotPasswordSchema>) {
    await this.auth.forgotPassword(body.email);
    return { ok: true };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(@Body(new ZodBody(resetPasswordSchema)) body: z.output<typeof resetPasswordSchema>) {
    await this.auth.resetPassword(body.token, body.password);
  }
}
