import { Schema } from 'mongoose';

/** An image stored on Cloudinary. Only its id and facts are kept; URLs are built on read. */
export const imageSchema = new Schema({
  publicId: { type: String, required: true },
  version: { type: Number, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  format: { type: String, required: true },
  bytes: { type: Number, required: true },
  alt: { type: String, default: '' },
});
