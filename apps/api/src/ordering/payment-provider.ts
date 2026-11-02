import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { PaymentOutcome } from '@mm/shared';

export interface ChargeResult {
  status: 'succeeded' | 'failed' | 'pending' | 'unknown';
  providerRef: string | null;
}

/**
 * Simulated payment provider (the brief allows a sandbox). It behaves like a real one in the
 * ways that matter: charges are keyed by an idempotency key, so retrying the same key returns
 * the first result instead of charging again, and a call can time out with an unknown result.
 */
@Injectable()
export class PaymentProvider {
  private readonly charges = new Map<string, ChargeResult>();

  async charge(idempotencyKey: string, _amountCents: number, outcome: PaymentOutcome): Promise<ChargeResult> {
    const previous = this.charges.get(idempotencyKey);
    if (previous) return previous;
    const ref = `pay_sbx_${randomBytes(6).toString('hex')}`;
    const result: ChargeResult =
      outcome === 'success'
        ? { status: 'succeeded', providerRef: ref }
        : outcome === 'failure'
          ? { status: 'failed', providerRef: ref }
          : outcome === 'pending'
            ? { status: 'pending', providerRef: ref }
            : // A timeout: we never heard back, so there is no reference yet.
              { status: 'unknown', providerRef: null };
    this.charges.set(idempotencyKey, result);
    return result;
  }
}
