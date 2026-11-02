import { emailFor } from './email.js';

const envelope = <T>(type: string, payload: T) => ({ messageId: 'x', type, version: 1, occurredAt: '', payload }) as never;

describe('emailFor', () => {
  it('puts the code in the subject and body of the verification email', () => {
    const email = emailFor(
      envelope('identity.email_verification_requested', { userId: 'u', email: 'a@b.co', fullName: 'Alex Morgan', code: '482913' }),
    )!;
    expect(email.to).toBe('a@b.co');
    expect(email.subject).toBe('482913 is your Mini Marketplace code');
    expect(email.text).toContain('Hi Alex,');
  });

  it('includes the one-time reset link', () => {
    const email = emailFor(
      envelope('identity.password_reset_requested', { userId: 'u', email: 'a@b.co', fullName: 'Alex', resetUrl: 'http://x/reset?token=t' }),
    )!;
    expect(email.text).toContain('http://x/reset?token=t');
  });
});
