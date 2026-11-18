import { PRINTER_CATALOG_ATTRIBUTION, type PrinterModelView } from '@printbi/shared';
import { matchWords, SearchCombobox, SelectedCard } from '../../design-system';

/** Every typed word must appear in "brand model" ("bambu a1", "k1 max", "neptune 4"). */
export const searchModels = (models: PrinterModelView[], query: string) =>
  matchWords(models, query, (m) => m.fullName);

export const modelSummary = (m: PrinterModelView): string =>
  [
    m.typicalNozzleTempC && m.typicalBedTempC
      ? `${m.typicalNozzleTempC} / ${m.typicalBedTempC} °C`
      : null,
    m.buildVolumeMm ? `${m.buildVolumeMm.x}×${m.buildVolumeMm.y}×${m.buildVolumeMm.z} mm` : null,
    m.ratedPowerW ? `${m.ratedPowerW} W rated` : null,
  ]
    .filter(Boolean)
    .join(' · ');

interface PrinterModelPickerProps {
  models: PrinterModelView[];
  selected: PrinterModelView | null;
  onSelect: (model: PrinterModelView | null) => void;
}

/** Picks a printer from the bundled FDM catalog. Typing a printer by hand stays possible. */
export function PrinterModelPicker({ models, selected, onSelect }: PrinterModelPickerProps) {
  if (selected) {
    return (
      <SelectedCard
        label="Printer model"
        title={selected.fullName}
        detail={modelSummary(selected) || 'Spec sheet attached'}
        removeLabel={`Remove ${selected.fullName} and enter the printer by hand`}
        onRemove={() => onSelect(null)}
        note="The fields below were filled from the catalog. You can still change them."
      />
    );
  }
  return (
    <SearchCombobox
      label="Find your printer model"
      placeholder="e.g. Bambu A1, K1 Max, Neptune 4"
      listLabel="Printer models"
      items={models}
      search={searchModels}
      getId={(m) => m.id}
      onSelect={onSelect}
      emptyText="No model matches. Fill the fields below by hand."
      renderOption={(m) => (
        <>
          <span className="font-semibold">{m.fullName}</span>
          <span className="figure text-[12px] text-ink-muted">{modelSummary(m)}</span>
        </>
      )}
      hint={
        <>
          Not in the list? Skip this and fill the fields below by hand. Catalog:{' '}
          <a
            href={PRINTER_CATALOG_ATTRIBUTION.url}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-teal"
          >
            {PRINTER_CATALOG_ATTRIBUTION.name}
          </a>{' '}
          ({PRINTER_CATALOG_ATTRIBUTION.license}).
        </>
      }
    />
  );
}
