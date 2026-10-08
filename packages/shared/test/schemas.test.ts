import { describe, expect, it } from 'vitest';

import { expenseSchema, fieldErrors, groupSchema, settlementSchema, signUpSchema } from '../src';

const baseExpense = {
  description: 'Dinner',
  amount: 3000,
  paidById: 'a',
  category: 'FOOD',
  date: '2026-01-15T00:00:00.000Z',
  splitMode: 'EQUAL',
  participants: [{ userId: 'a' }, { userId: 'b' }],
};

describe('expenseSchema', () => {
  it('accepts a valid equal split and coerces the date', () => {
    const parsed = expenseSchema.parse(baseExpense);
    expect(parsed.date).toBeInstanceOf(Date);
    expect(parsed.category).toBe('FOOD');
  });

  it('rejects splits that do not add up, reporting on participants', () => {
    const result = expenseSchema.safeParse({
      ...baseExpense,
      splitMode: 'EXACT',
      participants: [
        { userId: 'a', value: 1000 },
        { userId: 'b', value: 1000 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error).participants).toMatch(/less than the total/);
  });

  it('rejects float amounts', () => {
    expect(expenseSchema.safeParse({ ...baseExpense, amount: 30.5 }).success).toBe(false);
  });

  it('trims and requires a description', () => {
    const result = expenseSchema.safeParse({ ...baseExpense, description: '   ' });
    expect(result.success).toBe(false);
  });
});

describe('other schemas', () => {
  it('normalises emails and enforces password length', () => {
    expect(signUpSchema.parse({ name: ' Asha ', email: ' Asha@Example.COM ', password: 'longenough' })).toEqual({
      name: 'Asha',
      email: 'asha@example.com',
      password: 'longenough',
    });
    expect(signUpSchema.safeParse({ name: 'A', email: 'a@b.co', password: 'short' }).success).toBe(false);
  });

  it('defaults group currency to INR and rejects unknown currencies', () => {
    expect(groupSchema.parse({ name: 'Trip' })).toMatchObject({ currency: 'INR', emoji: '👥' });
    expect(groupSchema.safeParse({ name: 'Trip', currency: 'XYZ' }).success).toBe(false);
  });

  it('does not allow settling with yourself', () => {
    expect(settlementSchema.safeParse({ fromUserId: 'a', toUserId: 'a', amount: 10 }).success).toBe(false);
  });
});
