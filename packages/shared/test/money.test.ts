import { describe, expect, it } from 'vitest';

import { formatMoney, parseMoney, toDecimalString } from '../src';

describe('parseMoney', () => {
  it.each([
    ['0.07', 7],
    ['1', 100],
    ['1.5', 150],
    ['1,234.56', 123456],
    ['₹ 99', 9900],
    ['.5', 50],
    ['10.', 1000],
  ])('parses %s as %d paise', (input, expected) => {
    expect(parseMoney(input, 'INR')).toBe(expected);
  });

  it('does not suffer from float rounding (0.1 + 0.2 style inputs)', () => {
    expect(parseMoney('0.29', 'INR')).toBe(29);
    expect(parseMoney('1.15', 'INR')).toBe(115);
    expect(parseMoney('4.35', 'USD')).toBe(435);
  });

  it('rejects too many decimals and garbage', () => {
    expect(parseMoney('1.234', 'INR')).toBeNull();
    expect(parseMoney('abc', 'INR')).toBeNull();
    expect(parseMoney('', 'INR')).toBeNull();
    expect(parseMoney('.', 'INR')).toBeNull();
    expect(parseMoney('1.2.3', 'INR')).toBeNull();
  });

  it('respects zero-decimal currencies', () => {
    expect(parseMoney('1500', 'JPY')).toBe(1500);
    expect(parseMoney('1500.5', 'JPY')).toBeNull();
  });
});

describe('formatMoney', () => {
  it('uses Indian digit grouping for INR', () => {
    expect(formatMoney(123456789, 'INR')).toBe('₹12,34,567.89');
    expect(formatMoney(99900, 'INR')).toBe('₹999.00');
  });

  it('uses western grouping for USD and handles negatives / signs', () => {
    expect(formatMoney(123456789, 'USD')).toBe('$1,234,567.89');
    expect(formatMoney(-550, 'USD')).toBe('-$5.50');
    expect(formatMoney(550, 'USD', { signed: true })).toBe('+$5.50');
  });

  it('compact drops .00 only for whole amounts', () => {
    expect(formatMoney(150000, 'INR', { compact: true })).toBe('₹1,500');
    expect(formatMoney(150050, 'INR', { compact: true })).toBe('₹1,500.50');
  });

  it('formats zero-decimal currencies', () => {
    expect(formatMoney(1500, 'JPY')).toBe('¥1,500');
  });

  it('round-trips through toDecimalString/parseMoney', () => {
    for (const minor of [0, 1, 9, 10, 99, 100, 101, 123456, 1000000000]) {
      expect(parseMoney(toDecimalString(minor, 'INR'), 'INR')).toBe(minor);
    }
  });
});
