import { model, Schema } from 'mongoose';
import { tenantScope } from '../../core/tenancy/tenant-scope.plugin';

/**
 * The picture on an order's card: the plate preview from its print file, or a photo the person
 * chose, already shrunk by the browser. Kept apart from the order so board lists stay light.
 */
const orderPictureSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    contentType: { type: String, required: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: true },
);

orderPictureSchema.index({ companyId: 1, orderId: 1 }, { unique: true });
orderPictureSchema.plugin(tenantScope);

export const OrderPictureModel = model('OrderPicture', orderPictureSchema);
