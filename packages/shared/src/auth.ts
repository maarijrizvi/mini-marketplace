import { z } from 'zod';
import { normalizePhone } from './phone.js';

const COMMON_PASSWORDS = new Set(['password1', 'qwerty123', '12345678a', 'letmein1', 'password123']);

/** Returns the rules a password breaks; an empty list means it is acceptable. */
export function passwordProblems(password: string, email = ''): string[] {
  const problems: string[] = [];
  if (password.length < 8) problems.push('Use at least 8 characters.');
  if (password.length > 128) problems.push('Use at most 128 characters.');
  if (!/[A-Za-z]/.test(password)) problems.push('Include a letter.');
  if (!/\d/.test(password)) problems.push('Include a number.');
  const local = email.split('@')[0]?.toLowerCase();
  if (local && local.length >= 3 && password.toLowerCase().includes(local)) problems.push('Don’t use your email in your password.');
  if (COMMON_PASSWORDS.has(password.toLowerCase())) problems.push('That password is too common.');
  return problems;
}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Enter a valid email address, like name@example.com.' }));

export const phoneSchema = z
  .string()
  .trim()
  .min(1, 'Enter your phone number.')
  .transform((raw, ctx) => {
    const e164 = normalizePhone(raw);
    if (!e164) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number.' });
      return z.NEVER;
    }
    return e164;
  });

const nameSchema = z.string().trim().min(1, 'Enter your full name.').max(120);

/** Rules that don't depend on other fields, so they're reported alongside every other field's problems. */
export const passwordSchema = z.string().superRefine((password, ctx) => {
  for (const message of passwordProblems(password)) ctx.addIssue({ code: 'custom', message });
});

const newAccountFields = {
  fullName: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, { message: 'Accept the terms of service and privacy policy.' }),
};

/** The one rule that needs the email; runs once the fields themselves are valid. */
function checkPassword(v: { password: string; email: string }, ctx: z.RefinementCtx) {
  const generic = new Set(passwordProblems(v.password));
  for (const message of passwordProblems(v.password, v.email)) {
    if (!generic.has(message)) ctx.addIssue({ code: 'custom', path: ['password'], message });
  }
}

export const signUpSchema = z.object(newAccountFields).superRefine(checkPassword);
export type SignUpInput = z.input<typeof signUpSchema>;

export const sellerRegisterSchema = z
  .object({
    ...newAccountFields,
    shopName: z.string().trim().min(2, 'Enter a name for your shop.').max(80),
    category: z.string().trim().min(1, 'Choose what you’ll sell.'),
    pickupAddress: z.string().trim().min(5, 'Enter your pickup address.').max(300),
  })
  .superRefine(checkPassword);
export type SellerRegisterInput = z.input<typeof sellerRegisterSchema>;

export const verifyEmailSchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/, 'Enter all 6 digits.'),
});

export const resendCodeSchema = z.object({ email: emailSchema });

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password: z.string(),
});

export type Role = 'customer' | 'seller' | 'admin';

/** What the API returns for the signed-in user. */
export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: Role;
  seller: { shopName: string; status: 'pending' | 'approved' | 'suspended' | 'rejected' } | null;
}
