import { slugify, type ShowcaseSettingsView, type showcaseSettingsSchema } from '@printbi/shared';
import type { Types } from 'mongoose';
import type { z } from 'zod';
import { audit } from '../../core/audit/audit';
import { ConflictError, NotFoundError } from '../../core/errors';
import { CompanyModel } from '../companies/company.model';

const SLUG_TAKEN = () =>
  new ConflictError('This link is already in use', [
    { path: 'slug', message: 'Another business already uses this link' },
  ]);

interface ShowcaseRecord {
  name: string;
  slug?: string | null;
  showcase?: Partial<Omit<ShowcaseSettingsView, 'slug' | 'publicPath'>> | null;
}

/** The business name as a link no other business uses: layer-lab, layer-lab-2... */
async function suggestSlug(companyId: Types.ObjectId, name: string): Promise<string> {
  const base = (slugify(name) || 'showcase').slice(0, 55).replace(/-+$/, '');
  // Slugs hold only a-z, 0-9 and hyphens, so the base needs no escaping.
  const pattern = new RegExp('^' + base + '(-\\d+)?$');
  const taken = new Set(
    (await CompanyModel.find({ slug: pattern, _id: { $ne: companyId } }, { slug: 1 }).lean()).map(
      (c) => c.slug,
    ),
  );
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Until a link is saved, a free one is suggested (and only saved with the settings). */
function toView(company: ShowcaseRecord, slug: string): ShowcaseSettingsView {
  return {
    published: company.showcase?.published ?? false,
    slug,
    title: company.showcase?.title ?? '',
    description: company.showcase?.description ?? '',
    language: company.showcase?.language ?? 'pt-BR',
    whatsapp: company.showcase?.whatsapp ?? '',
    messageTemplate: company.showcase?.messageTemplate ?? '',
    publicPath: `/s/${slug}`,
  };
}

export async function getShowcaseSettings(
  companyId: Types.ObjectId,
): Promise<ShowcaseSettingsView> {
  const company = await CompanyModel.findById(companyId, { name: 1, slug: 1, showcase: 1 }).lean();
  if (!company) throw new NotFoundError('Company');
  const slug = company.slug ?? (await suggestSlug(companyId, company.name));
  return toView(company as ShowcaseRecord, slug);
}

export async function updateShowcaseSettings(
  companyId: Types.ObjectId,
  actorId: Types.ObjectId,
  input: z.output<typeof showcaseSettingsSchema>,
): Promise<ShowcaseSettingsView> {
  const { slug, ...showcase } = input;
  if (await CompanyModel.exists({ slug, _id: { $ne: companyId } })) throw SLUG_TAKEN();
  try {
    await CompanyModel.updateOne({ _id: companyId }, { $set: { slug, showcase } });
  } catch (error) {
    // Two businesses claiming the same link at the same moment: the unique index decides.
    if ((error as { code?: number }).code === 11000) throw SLUG_TAKEN();
    throw error;
  }
  await audit({
    companyId,
    actorId,
    action: input.published ? 'showcase.published' : 'showcase.updated',
    entity: 'company',
    entityId: companyId,
  });
  return getShowcaseSettings(companyId);
}
