/**
 * Money helpers. All amounts are integers in the currency's *minor unit*
 * (paise for INR, cents for USD, yen for JPY). Floats never touch a stored
 * amount: user input is parsed from its decimal string representation.
 */

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  /** Number of decimal places of the minor unit (2 for INR/USD, 0 for JPY). */
  decimals: number;
  locale: string;
}

export const CURRENCIES = {
  INR: { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimals: 2, locale: 'en-IN' },
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2, locale: 'en-US' },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2, locale: 'en-IE' },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2, locale: 'en-GB' },
  AED: { code: 'AED', name: 'UAE Dirham', symbol: 'AED', decimals: 2, locale: 'en-AE' },
  SGD: { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimals: 2, locale: 'en-SG' },
  THB: { code: 'THB', name: 'Thai Baht', symbol: '฿', decimals: 2, locale: 'en-US' },
  JPY: { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0, locale: 'ja-JP' },
} as const satisfies Record<string, CurrencyInfo>;

export type CurrencyCode = keyof typeof CURRENCIES;

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export const DEFAULT_CURRENCY: CurrencyCode = 'INR';

/**
 * Upper bound for a single amount in minor units (1e9 = ₹1,00,00,000.00, i.e. one crore rupees).
 * Keeping amounts below this guarantees that amounts fit a 32-bit GraphQL/Postgres `Int` and that `amount * 10_000` (used by the
 * percentage split) stays far inside Number.MAX_SAFE_INTEGER, so integer
 * arithmetic on plain numbers is exact.
 */
export const MAX_AMOUNT_MINOR = 1_000_000_000;

export function isCurrencyCode(code: string): code is CurrencyCode {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, code);
}

export function currencyInfo(code: string): CurrencyInfo {
  return isCurrencyCode(code) ? CURRENCIES[code] : CURRENCIES[DEFAULT_CURRENCY];
}

/**
 * Parse a user-entered decimal string ("1,234.5", "₹ 99", "0.07") into minor
 * units without going through floating point. Returns `null` for invalid
 * input or more fractional digits than the currency supports.
 */
export function parseMoney(input: string, currency: string = DEFAULT_CURRENCY): number | null {
  const { decimals } = currencyInfo(currency);
  const cleaned = input.replace(/[\s,_]/g, '').replace(/^[^\d.-]+/, '');
  if (cleaned === '' || cleaned === '.' || cleaned === '-') return null;
  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) return null;
  const [, sign, wholeRaw = '', fracRaw = ''] = match;
  if (wholeRaw === '' && fracRaw === '') return null;
  if (fracRaw.length > decimals) return null;
  const whole = wholeRaw === '' ? 0 : Number(wholeRaw);
  const frac = Number((fracRaw + '0'.repeat(decimals)).slice(0, decimals) || '0');
  const minor = whole * 10 ** decimals + frac;
  if (!Number.isSafeInteger(minor)) return null;
  return sign ? -minor : minor;
}

/** Convert minor units to a plain decimal string ("1234.50"). */
export function toDecimalString(minor: number, currency: string = DEFAULT_CURRENCY): string {
  const { decimals } = currencyInfo(currency);
  const negative = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  if (decimals === 0) return `${negative ? '-' : ''}${abs}`;
  const base = 10 ** decimals;
  const whole = Math.floor(abs / base);
  const frac = String(abs % base).padStart(decimals, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

function groupDigits(whole: string, locale: string): string {
  if (locale === 'en-IN') {
    // Indian numbering: 12,34,567
    if (whole.length <= 3) return whole;
    const last3 = whole.slice(-3);
    const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return `${rest},${last3}`;
  }
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export interface FormatMoneyOptions {
  /** Drop ".00" when the amount is a whole number. */
  compact?: boolean;
  /** Always show a leading + for positive amounts. */
  signed?: boolean;
}

/**
 * Format minor units for display, e.g. 123456 INR -> "₹1,234.56".
 * Implemented without Intl so output is identical on Hermes, JSC and web.
 */
export function formatMoney(
  minor: number,
  currency: string = DEFAULT_CURRENCY,
  options: FormatMoneyOptions = {},
): string {
  const info = currencyInfo(currency);
  const negative = minor < 0;
  const [whole = '0', frac] = toDecimalString(Math.abs(minor), currency).split('.');
  const showFrac = frac !== undefined && !(options.compact && /^0+$/.test(frac));
  const symbol = info.symbol.length > 1 ? `${info.symbol} ` : info.symbol;
  const body = `${symbol}${groupDigits(whole, info.locale)}${showFrac ? `.${frac}` : ''}`;
  if (negative) return `-${body}`;
  if (options.signed && minor > 0) return `+${body}`;
  return body;
}

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}
