import { signUploadSchema, type UploadConfigView } from '@printbi/shared';
import { Router } from 'express';
import { Types } from 'mongoose';
import { authenticate, getCompanyAuth, requireCompany } from '../../core/auth/authenticate';
import { ForbiddenError, NotFoundError } from '../../core/errors';
import { parseInput } from '../../core/http/validate';
import { uploadsEnabled } from '../../core/media/cloudinary';
import { logoRule, productImageRule, signFor } from '../../core/media/uploads';
import { ProductModel } from '../products/product.model';

/**
 * Signed uploads: the browser sends the file straight to Cloudinary, but only to the exact
 * id, folder and formats the API signed here. The record is linked afterwards, once the API
 * has checked what was stored.
 */
export const uploadsRouter = Router();
uploadsRouter.use(authenticate, requireCompany);

uploadsRouter.get('/config', (_req, res) => {
  const view: UploadConfigView = { enabled: uploadsEnabled() };
  res.json(view);
});

uploadsRouter.post('/sign', async (req, res) => {
  const auth = getCompanyAuth(req);
  const input = parseInput(signUploadSchema, req.body);
  if (input.target === 'logo') {
    if (!auth.permissions.includes('settings:manage')) throw new ForbiddenError();
    res.json(signFor(logoRule(auth.companyId)));
    return;
  }
  const productId = new Types.ObjectId(input.productId);
  if (!(await ProductModel.exists({ _id: productId, companyId: auth.companyId }))) {
    throw new NotFoundError('Product');
  }
  res.json(signFor(productImageRule(auth.companyId, productId)));
});
