import { z } from 'zod';

import { EXPENSE_CATEGORIES } from './categories';
import { CURRENCY_CODES, MAX_AMOUNT_MINOR } from './money';
import { computeSplit, SPLIT_MODES } from './split';

/**
 * Validation schemas shared by the client (forms) and the API (resolver input
 * validation). The API never trusts the client: every mutation re-parses its
 * input with these schemas and recomputes splits server-side.
 */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Enter a valid email address' }));

export const passwordSchema = z
  .string()
  .min(8, { error: 'Password must be at least 8 characters' })
  .max(128, { error: 'Password must be at most 128 characters' });

export const nameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Name is required' })
  .max(60, { error: 'Name must be at most 60 characters' });

export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: 'Password is required' }),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const currencySchema = z.enum(CURRENCY_CODES as [string, ...string[]], {
  error: 'Unsupported currency',
});

export const groupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Group name is required' })
    .max(60, { error: 'Group name must be at most 60 characters' }),
  emoji: z.string().trim().min(1).max(16).default('👥'),
  currency: currencySchema.default('INR'),
});
export type GroupInput = z.infer<typeof groupSchema>;

export const inviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6,12}$/, { error: 'Invite codes are 6–12 letters or digits' });

export const amountSchema = z
  .number({ error: 'Amount is required' })
  .int({ error: 'Amount must be in minor units' })
  .positive({ error: 'Amount must be greater than zero' })
  .max(MAX_AMOUNT_MINOR, { error: 'Amount is too large' });

export const splitParticipantSchema = z.object({
  userId: z.string().min(1),
  value: z.number().int().nonnegative().nullish(),
});

export const expenseSchema = z
  .object({
    description: z
      .string()
      .trim()
      .min(1, { error: 'Add a description' })
      .max(120, { error: 'Description must be at most 120 characters' }),
    amount: amountSchema,
    paidById: z.string().min(1, { error: 'Choose who paid' }),
    category: z.enum(EXPENSE_CATEGORIES).default('OTHER'),
    date: z.coerce.date({ error: 'Invalid date' }),
    notes: z.string().trim().max(500, { error: 'Notes must be at most 500 characters' }).nullish(),
    splitMode: z.enum(SPLIT_MODES),
    participants: z.array(splitParticipantSchema).min(1, { error: 'Choose at least one person' }),
  })
  .superRefine((value, ctx) => {
    const result = computeSplit(value.amount, value.splitMode, value.participants);
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: result.error, path: ['participants'] });
    }
  });
export type ExpenseInput = z.input<typeof expenseSchema>;
export type ExpenseParsed = z.output<typeof expenseSchema>;

export const settlementSchema = z
  .object({
    fromUserId: z.string().min(1),
    toUserId: z.string().min(1),
    amount: amountSchema,
    note: z.string().trim().max(200).nullish(),
  })
  .refine((v) => v.fromUserId !== v.toUserId, {
    error: 'Payer and recipient must be different people',
    path: ['toUserId'],
  });
export type SettlementInput = z.infer<typeof settlementSchema>;

/** Flatten a ZodError into `{ field: message }` for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.map(String).join('.') : '_form';
    out[key] ??= issue.message;
  }
  return out;
}
