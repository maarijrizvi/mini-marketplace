import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/** Numbers without a + are read as local numbers in this country. */
export const DEFAULT_PHONE_COUNTRY: CountryCode = 'PK';

/**
 * Returns the number in E.164 form (+923001234567), or null if it is not a valid number.
 * Storing E.164 lets the database enforce one account per phone number, whatever format people type.
 */
export function normalizePhone(raw: string, country: CountryCode = DEFAULT_PHONE_COUNTRY): string | null {
  const parsed = parsePhoneNumberFromString(raw.trim(), country);
  return parsed && parsed.isValid() ? parsed.number : null;
}
