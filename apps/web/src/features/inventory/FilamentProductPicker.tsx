import { FILAMENT_CATALOG_ATTRIBUTION, type FilamentProductView } from '@printbi/shared';
import { matchWords, SearchCombobox, SelectedCard } from '../../design-system';

const fullName = (p: FilamentProductView) => `${p.brand} ${p.product}`;

export const searchFilaments = (items: FilamentProductView[], query: string) =>
  matchWords(items, query, (p) => `${p.brand} ${p.product} ${p.type}`);

export const filamentSummary = (p: FilamentProductView): string =>
  [
    p.type,
    p.nozzleTempMin && p.nozzleTempMax ? `nozzle ${p.nozzleTempMin}–${p.nozzleTempMax} °C` : null,
    p.bedTempMin !== null && p.bedTempMax !== null
      ? `bed ${p.bedTempMin}–${p.bedTempMax} °C`
      : null,
    p.densityGcm3 ? `${p.densityGcm3} g/cm³` : null,
  ]
    .filter(Boolean)
    .join(' · ');

interface FilamentProductPickerProps {
  products: FilamentProductView[];
  selected: FilamentProductView | null;
  onSelect: (product: FilamentProductView | null) => void;
}

/** Fills brand, material, diameter, density and temperatures from the filament catalog. */
export function FilamentProductPicker({
  products,
  selected,
  onSelect,
}: FilamentProductPickerProps) {
  if (selected) {
    return (
      <SelectedCard
        label="Filament product"
        title={fullName(selected)}
        detail={filamentSummary(selected)}
        removeLabel={`Remove ${fullName(selected)} and enter the filament by hand`}
        onRemove={() => onSelect(null)}
        note="Material, temperatures and density were filled from the catalog. You can still change them."
      />
    );
  }
  return (
    <SearchCombobox
      label="Find the filament"
      placeholder="e.g. Bambu PLA Basic, eSUN PETG, Polymaker"
      listLabel="Filament products"
      items={products}
      search={searchFilaments}
      getId={(p) => p.id}
      onSelect={onSelect}
      emptyText="No product matches. Fill the fields below by hand."
      renderOption={(p) => (
        <>
          <span className="font-semibold">{fullName(p)}</span>
          <span className="figure text-[12px] text-ink-muted">{filamentSummary(p)}</span>
        </>
      )}
      hint={
        <>
          Not in the list? Skip this and fill the fields below by hand. Catalog:{' '}
          <a
            href={FILAMENT_CATALOG_ATTRIBUTION.url}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-teal"
          >
            {FILAMENT_CATALOG_ATTRIBUTION.name}
          </a>{' '}
          ({FILAMENT_CATALOG_ATTRIBUTION.license}).
        </>
      }
    />
  );
}
