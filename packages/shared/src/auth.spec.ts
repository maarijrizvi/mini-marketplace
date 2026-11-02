import { normalizePhone, passwordProblems, signUpSchema } from './index.js';

describe('normalizePhone', () => {
  it('treats local and international formats of one number as the same', () => {
    expect(normalizePhone('0300 1234567')).toBe('+923001234567');
    expect(normalizePhone('+92 300 1234567')).toBe('+923001234567');
    expect(normalizePhone('+92-300-123-4567')).toBe('+923001234567');
  });

  it('rejects numbers that are not valid', () => {
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('not a number')).toBeNull();
  });
});

describe('passwordProblems', () => {
  it('accepts a password with a letter, a number and 8+ characters', () => {
    expect(passwordProblems('Secret123', 'alex@example.com')).toEqual([]);
  });

  it('rejects short, letter-only, common and email-based passwords', () => {
    expect(passwordProblems('abc1')).toContain('Use at least 8 characters.');
    expect(passwordProblems('abcdefghij')).toContain('Include a number.');
    expect(passwordProblems('password1')).toContain('That password is too common.');
    expect(passwordProblems('alexalex12', 'alex@example.com')).toContain('Don’t use your email in your password.');
  });
});

describe('signUpSchema', () => {
  const valid = {
    fullName: 'Alex Morgan',
    email: ' Alex@Example.com ',
    phone: '0300 1234567',
    password: 'Secret123',
    acceptTerms: true as const,
  };

  it('normalises email and phone', () => {
    const parsed = signUpSchema.parse(valid);
    expect(parsed.email).toBe('alex@example.com');
    expect(parsed.phone).toBe('+923001234567');
  });

  it('requires accepting the terms', () => {
    expect(signUpSchema.safeParse({ ...valid, acceptTerms: false }).success).toBe(false);
  });
});
