import { z } from 'zod';
import { decimalSchema, objectIdSchema } from './common';
import { PAYMENT_METHODS } from './inventory';
import { moneyInputSchema } from './settings';

const positiveDecimal = decimalSchema.refine((v) => v > 0, {
  message: 'Must be greater than zero',
});

export const paymentInputSchema = z.object({
  /** In the expense's currency. */
  amount: positiveDecimal,
  paidAt: z.coerce.date(),
  method: z.enum(PAYMENT_METHODS),
  note: z.string().trim().max(200).default(''),
});

export const expenseInputSchema = z.object({
  description: z.string().trim().min(1, 'Describe the expense').max(200),
  categoryId: objectIdSchema,
  amount: moneyInputSchema.refine((m) => m.amount > 0, {
    message: 'Must be greater than zero',
    path: ['amount'],
  }),
  purchasedAt: z.coerce.date(),
  vendor: z.string().trim().max(120).default(''),
  dueDate: z.coerce.date().nullable().default(null),
  notes: z.string().trim().max(1000).default(''),
  payments: z.array(paymentInputSchema).max(50).default([]),
});

export const updateExpenseSchema = z
  .object({
    description: expenseInputSchema.shape.description,
    categoryId: objectIdSchema,
    amount: expenseInputSchema.shape.amount,
    purchasedAt: z.coerce.date(),
    vendor: z.string().trim().max(120),
    dueDate: z.coerce.date().nullable(),
    notes: z.string().trim().max(1000),
  })
  .partial();

export const cancelExpenseSchema = z.object({
  reason: z.string().trim().min(1, 'Explain why it is cancelled').max(300),
});

export const EXPENSE_STATUSES = ['pending', 'partial', 'paid', 'cancelled'] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const expenseFiltersSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  categoryId: objectIdSchema.optional(),
  status: z.enum(EXPENSE_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
});
