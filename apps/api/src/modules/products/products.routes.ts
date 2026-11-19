import {
  archiveSchema,
  objectIdSchema,
  productFiltersSchema,
  productInputSchema,
  productShowcaseSchema,
  registerImageSchema,
  updateImagesSchema,
} from '@printbi/shared';
import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import {
  authenticate,
  getCompanyAuth,
  requireCompany,
  requirePermission,
} from '../../core/auth/authenticate';
import { parseInput } from '../../core/http/validate';
import * as service from './products.service';

export const productsRouter = Router();
productsRouter.use(authenticate, requireCompany);

const context = (req: Request) => {
  const auth = getCompanyAuth(req);
  return { auth, finance: auth.permissions.includes('finance:view') };
};
const id = (value: unknown) => new Types.ObjectId(parseInput(objectIdSchema, value));

productsRouter.get('/', async (req, res) => {
  const { auth, finance } = context(req);
  res.json(
    await service.listProducts(
      auth.companyId,
      parseInput(productFiltersSchema, req.query),
      finance,
    ),
  );
});

productsRouter.post('/', async (req, res) => {
  const { auth, finance } = context(req);
  const input = parseInput(productInputSchema, req.body);
  res.status(201).json(await service.createProduct(auth.companyId, auth.userId, input, finance));
});

productsRouter.get('/:productId', async (req, res) => {
  const { auth, finance } = context(req);
  res.json(await service.getProduct(auth.companyId, id(req.params.productId), finance));
});

productsRouter.put('/:productId', async (req, res) => {
  const { auth, finance } = context(req);
  const input = parseInput(productInputSchema, req.body);
  res.json(
    await service.updateProduct(
      auth.companyId,
      auth.userId,
      id(req.params.productId),
      input,
      finance,
    ),
  );
});

productsRouter.post(
  '/:productId/archive',
  requirePermission('records:archive'),
  async (req, res) => {
    const { auth, finance } = context(req);
    const { archived, reason } = parseInput(archiveSchema, req.body);
    res.json(
      await service.setProductArchived(
        auth.companyId,
        auth.userId,
        id(req.params.productId),
        archived,
        reason,
        finance,
      ),
    );
  },
);

// Photos: any member who edits the catalog can manage them.
productsRouter.post('/:productId/images', async (req, res) => {
  const { auth, finance } = context(req);
  const { publicId } = parseInput(registerImageSchema, req.body);
  res
    .status(201)
    .json(
      await service.addProductImage(
        auth.companyId,
        auth.userId,
        id(req.params.productId),
        publicId,
        finance,
      ),
    );
});

productsRouter.put('/:productId/images', async (req, res) => {
  const { auth, finance } = context(req);
  const input = parseInput(updateImagesSchema, req.body);
  res.json(
    await service.updateProductImages(
      auth.companyId,
      auth.userId,
      id(req.params.productId),
      input,
      finance,
    ),
  );
});

productsRouter.delete('/:productId/images/:imageId', async (req, res) => {
  const { auth, finance } = context(req);
  res.json(
    await service.removeProductImage(
      auth.companyId,
      auth.userId,
      id(req.params.productId),
      id(req.params.imageId),
      finance,
    ),
  );
});

// Whether and how it shows on the public showcase: admin only.
productsRouter.put(
  '/:productId/showcase',
  requirePermission('showcase:manage'),
  async (req, res) => {
    const { auth, finance } = context(req);
    const input = parseInput(productShowcaseSchema, req.body);
    res.json(
      await service.setProductShowcase(
        auth.companyId,
        auth.userId,
        id(req.params.productId),
        input,
        finance,
      ),
    );
  },
);

productsRouter.delete('/:productId', requirePermission('records:archive'), async (req, res) => {
  const { auth } = context(req);
  await service.deleteProduct(auth.companyId, auth.userId, id(req.params.productId));
  res.status(204).end();
});
