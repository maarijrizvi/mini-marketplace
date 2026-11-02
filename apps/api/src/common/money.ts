/**
 * Money is handled in integer cents inside the API and as "12.34" strings at the edges.
 * Floats never hold a price.
 */
export type Cents = number;

export function toCents(value: { toString(): string } | string | number): Cents {
  const [whole, frac = ''] = String(value).split('.');
  const sign = whole.startsWith('-') ? -1 : 1;
  return sign * (Math.abs(Number(whole)) * 100 + Number((frac + '00').slice(0, 2)));
}

export function fromCents(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Splits `total` across `weights` in proportion, giving leftover cents to the largest remainders,
 * so the parts always add up to exactly `total`.
 */
export function allocate(total: Cents, weights: Cents[]): Cents[] {
  const sum = weights.reduce((a, w) => a + w, 0);
  if (sum === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const parts = raw.map(Math.floor);
  let left = total - parts.reduce((a, p) => a + p, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem);
  for (const { i } of order) {
    if (left <= 0) break;
    parts[i] += 1;
    left -= 1;
  }
  return parts;
}
