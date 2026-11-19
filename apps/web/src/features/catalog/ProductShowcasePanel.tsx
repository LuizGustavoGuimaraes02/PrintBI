import type { ProductShowcaseView, ProductView, ShowcaseBadge } from '@printbi/shared';
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Badge, cn, Panel, SwitchField, useToast } from '../../design-system';
import { api, ApiError } from '../../lib/api';
import { useCan } from '../auth/account';
import { useShowcaseSettings } from '../settings/queries';

const BADGES: { value: ShowcaseBadge; label: string; hint: string }[] = [
  { value: 'ready', label: 'Already made', hint: 'In stock, ready to go' },
  { value: 'made_to_order', label: 'Made to order', hint: 'Printed after the order' },
];

export const badgeLabel = (badge: ShowcaseBadge) =>
  BADGES.find((b) => b.value === badge)?.label ?? badge;

/** How the product appears on the public showcase. Only an admin changes it. */
export function ProductShowcasePanel({
  product,
  onChange,
}: {
  product: ProductView;
  onChange: (product: ProductView) => void;
}) {
  const canManage = useCan('showcase:manage');
  const toast = useToast();
  const { data: settings } = useShowcaseSettings();
  const [saving, setSaving] = useState(false);
  const current = product.showcase;

  const save = async (patch: Partial<ProductShowcaseView>) => {
    const next = { ...current, ...patch };
    setSaving(true);
    try {
      const saved = await api.put<ProductView>(`/products/${product.id}/showcase`, {
        visible: next.visible,
        badge: next.badge,
        showPrice: next.showPrice,
        featured: next.featured,
      });
      onChange(saved);
      if (patch.visible !== undefined) {
        toast.success(patch.visible ? 'Shown on the showcase' : 'Hidden from the showcase');
      }
    } catch (error) {
      toast.error('Not changed', error instanceof ApiError ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const publicLink =
    settings?.published && current.visible && current.slug
      ? `${settings.publicPath}/${current.slug}`
      : null;

  return (
    <Panel
      title="Showcase"
      description="Your public page where customers browse what you make."
      actions={
        publicLink && (
          <Link
            to={publicLink}
            target="_blank"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal hover:underline"
          >
            View on showcase <ExternalLink size={14} aria-hidden="true" />
          </Link>
        )
      }
    >
      {!canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={current.visible ? 'teal' : 'neutral'}>
            {current.visible ? 'On the showcase' : 'Not on the showcase'}
          </Badge>
          {current.visible && <Badge>{badgeLabel(current.badge)}</Badge>}
          <span className="text-sm text-ink-muted">Only an admin can change this.</span>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <SwitchField
            label="Show on the showcase"
            description={
              product.archived
                ? 'Restore the product first.'
                : 'Hiding it never affects quotes, sales or history.'
            }
            checked={current.visible}
            disabled={saving || (product.archived && !current.visible)}
            onCheckedChange={(visible) => void save({ visible })}
          />
          {current.visible && (
            <>
              <fieldset className="flex min-w-0 flex-col gap-2" disabled={saving}>
                <legend className="mb-2 font-semibold">Label on the card</legend>
                <div className="grid gap-2">
                  {BADGES.map((b) => (
                    <label
                      key={b.value}
                      className={cn(
                        'flex cursor-pointer flex-col gap-0.5 rounded-[var(--radius-tile)] border-[1.5px] px-4 py-2.5',
                        current.badge === b.value
                          ? 'border-teal bg-teal-soft'
                          : 'border-rule hover:bg-bench',
                      )}
                    >
                      <span className="flex items-center gap-2 font-bold">
                        <input
                          type="radio"
                          name="showcase-badge"
                          className="accent-teal"
                          checked={current.badge === b.value}
                          onChange={() => void save({ badge: b.value })}
                        />
                        {b.label}
                      </span>
                      <span className="pl-6 text-[13px] text-ink-muted">{b.hint}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <SwitchField
                label="Show the price"
                description={
                  product.price
                    ? 'Shown as “From …”, using the usual price.'
                    : 'Add a usual price above to show it.'
                }
                checked={current.showPrice}
                disabled={saving || !product.price}
                onCheckedChange={(showPrice) => void save({ showPrice })}
              />
              <SwitchField
                label="Featured"
                description="Shown as a larger tile on the showcase."
                checked={current.featured}
                disabled={saving}
                onCheckedChange={(featured) => void save({ featured })}
              />
            </>
          )}
          {settings && !settings.published && (
            <p className="text-sm text-ink-muted">
              Your showcase is not published yet.{' '}
              <Link to="/showcase" className="font-semibold text-teal hover:underline">
                Set it up
              </Link>
              .
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
