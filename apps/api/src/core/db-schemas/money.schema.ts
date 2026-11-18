import { CURRENCIES } from '@printbi/shared';
import { Schema } from 'mongoose';

const integer = {
  validator: (value: number | null) => value === null || Number.isSafeInteger(value),
  message: 'Amounts are stored as integer micro-units',
};

/** `{ amount, currency }` with `amount` in integer micro-units. Reused by every money field. */
export const moneySchema = new Schema(
  {
    amount: { type: Number, required: true, validate: integer },
    currency: { type: String, enum: CURRENCIES, required: true },
  },
  { _id: false },
);

/** A decimal value (rate, percent, hours) in integer micro-units. */
export const microField = (required = true) => ({ type: Number, required, validate: integer });
