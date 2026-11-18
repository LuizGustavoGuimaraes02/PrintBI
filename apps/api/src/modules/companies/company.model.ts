import { ROLES } from '@printbi/shared';
import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

/** Pending and past invitations. Only the hash of the token is stored. */
const inviteSchema = new Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  role: { type: String, enum: ROLES, required: true },
  finance: { type: Boolean, default: false },
  tokenHash: { type: String, required: true },
  invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: () => new Date() },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  usedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  revokedAt: { type: Date, default: null },
});

const companySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    website: { type: String, trim: true },
    social: { type: String, trim: true },
    invites: { type: [inviteSchema], default: [], select: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

companySchema.index({ 'invites.tokenHash': 1 }, { sparse: true });

export type Company = InferSchemaType<typeof companySchema>;
export type CompanyDocument = HydratedDocument<Company>;
export const CompanyModel = model('Company', companySchema);
