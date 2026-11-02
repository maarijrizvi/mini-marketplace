import type { EventEnvelope, EventType } from '@mm/shared';

export interface Email {
  to: string;
  subject: string;
  text: string;
}

const first = (fullName: string) => fullName.split(' ')[0] || fullName;

/** Builds the email for an event, or returns null when the event sends no email. */
export function emailFor(event: EventEnvelope): Email | null {
  switch (event.type) {
    case 'identity.email_verification_requested': {
      const p = (event as EventEnvelope<'identity.email_verification_requested'>).payload;
      return {
        to: p.email,
        subject: `${p.code} is your Mini Marketplace code`,
        text: `Hi ${first(p.fullName)},\n\nYour verification code is ${p.code}. It expires in 24 hours.\n\nIf you didn’t create an account, you can ignore this email.`,
      };
    }
    case 'identity.password_reset_requested': {
      const p = (event as EventEnvelope<'identity.password_reset_requested'>).payload;
      return {
        to: p.email,
        subject: 'Reset your Mini Marketplace password',
        text: `Hi ${first(p.fullName)},\n\nSomeone asked to reset the password for this account. If it was you, choose a new one here (the link works once and expires in 30 minutes):\n\n${p.resetUrl}\n\nIf it wasn’t you, ignore this email and your password won’t change.`,
      };
    }
    case 'identity.password_changed': {
      const p = (event as EventEnvelope<'identity.password_changed'>).payload;
      return {
        to: p.email,
        subject: 'Your Mini Marketplace password was changed',
        text: `Hi ${first(p.fullName)},\n\nYour password was just changed and every device was signed out. If this wasn’t you, reset your password now and contact support.`,
      };
    }
    case 'identity.seller_applied': {
      const p = (event as EventEnvelope<'identity.seller_applied'>).payload;
      return {
        to: p.email,
        subject: `We’re reviewing ${p.shopName}`,
        text: `Hi ${first(p.fullName)},\n\nThanks for registering ${p.shopName}. Our team reviews every new shop; we’ll email you when there’s a decision. Meanwhile you can add products as drafts.`,
      };
    }
    case 'ordering.order_placed': {
      const p = (event as EventEnvelope<'ordering.order_placed'>).payload;
      return {
        to: p.customerEmail,
        subject: `Order ${p.orderNumber} confirmed`,
        text: `Hi ${first(p.customerName)},\n\nThanks for your order ${p.orderNumber} (total ${p.total}). Each seller ships their part separately; you can track every parcel from My orders.`,
      };
    }
    case 'ordering.payment_failed': {
      const p = (event as EventEnvelope<'ordering.payment_failed'>).payload;
      return {
        to: p.customerEmail,
        subject: `Payment for ${p.orderNumber} didn’t go through`,
        text: `Hi ${first(p.customerName)},\n\nWe couldn’t take payment for order ${p.orderNumber}, so you haven’t been charged. The items are still in your cart if you’d like to try again.`,
      };
    }
    case 'ordering.order_cancelled': {
      const p = (event as EventEnvelope<'ordering.order_cancelled'>).payload;
      return {
        to: p.customerEmail,
        subject: `Order ${p.orderNumber} was cancelled`,
        text: `Hi ${first(p.customerName)},\n\nOrder ${p.orderNumber} was cancelled: ${p.reason}. Any payment taken is being refunded.`,
      };
    }
    default: {
      const unhandled: never = event.type as never;
      return unhandled;
    }
  }
}

export const EMAIL_EVENTS: readonly EventType[] = [
  'identity.email_verification_requested',
  'identity.password_reset_requested',
  'identity.password_changed',
  'identity.seller_applied',
  'ordering.order_placed',
  'ordering.payment_failed',
  'ordering.order_cancelled',
];
