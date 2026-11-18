import { ROLES } from '@printbi/shared';
import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

const membershipSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    role: { type: String, enum: ROLES, required: true },
    /** Admin-controlled access to financial data for employees. */
    finance: { type: Boolean, default: false },
    joinedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

/** One per signed-in device. Only hashes of refresh tokens are stored. */
const sessionSchema = new Schema({
  tokenHash: { type: String, required: true },
  /** The hash this one replaced; reusing it means the token was stolen. */
  previousHash: { type: String },
  rotatedAt: { type: Date },
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', default: null },
  userAgent: { type: String, maxlength: 200 },
  createdAt: { type: Date, default: () => new Date() },
  lastUsedAt: { type: Date, default: () => new Date() },
  expiresAt: { type: Date, required: true },
});

const userSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    memberships: { type: [membershipSchema], default: [] },
    sessions: { type: [sessionSchema], default: [], select: false },
    passwordReset: {
      type: new Schema({ tokenHash: String, expiresAt: Date }, { _id: false }),
      select: false,
    },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ 'memberships.companyId': 1 });
userSchema.index({ 'sessions.tokenHash': 1 });
userSchema.index({ 'sessions.previousHash': 1 }, { sparse: true });
userSchema.index({ 'passwordReset.tokenHash': 1 }, { sparse: true });

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<User>;
export const UserModel = model('User', userSchema);
