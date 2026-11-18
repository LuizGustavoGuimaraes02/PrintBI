import {
  PRINTER_CATALOG_ATTRIBUTION,
  type PrinterModelView,
  type PrinterView,
} from '@printbi/shared';
import { Modal } from '../../design-system';

const euros = (value: number) =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'EUR',
    currencyDisplay: 'code',
    maximumFractionDigits: 0,
  }).format(value);
const number = new Intl.NumberFormat('en-CA');

function rows(model: PrinterModelView): { label: string; value: string | null; note?: string }[] {
  return [
    {
      label: 'Build volume',
      value: model.buildVolumeMm
        ? `${model.buildVolumeMm.x} × ${model.buildVolumeMm.y} × ${model.buildVolumeMm.z} mm`
        : model.buildVolumeCm3
          ? `${number.format(model.buildVolumeCm3)} cm³`
          : null,
    },
    { label: 'Nozzle', value: model.nozzleDiameterMm ? `${model.nozzleDiameterMm} mm` : null },
    { label: 'Max speed', value: model.maxSpeedMmS ? `${model.maxSpeedMmS} mm/s` : null },
    {
      label: 'Typical nozzle temperature',
      value: model.typicalNozzleTempC ? `${model.typicalNozzleTempC} °C` : null,
    },
    {
      label: 'Typical bed temperature',
      value: model.typicalBedTempC ? `${model.typicalBedTempC} °C` : null,
    },
    {
      label: 'Rated power',
      value: model.ratedPowerW ? `${number.format(model.ratedPowerW)} W` : null,
      note: 'Peak rating. The average draw while printing is usually much lower.',
    },
    { label: 'Heater power', value: model.heaterPowerW ? `${model.heaterPowerW} W` : null },
    {
      label: 'Typical retail price',
      value: model.typicalPriceEur ? euros(model.typicalPriceEur) : null,
      note: 'Reference only, not your purchase price.',
    },
    {
      label: 'Maintenance estimate',
      value: model.maintenanceEurPerYear ? `${euros(model.maintenanceEurPerYear)} / year` : null,
    },
  ];
}

interface PrinterSpecSheetProps {
  printer: PrinterView;
  model: PrinterModelView;
  onClose: () => void;
}

/** The printer's technical sheet from the catalog, next to how the business set it up. */
export function PrinterSpecSheet({ printer, model, onClose }: PrinterSpecSheetProps) {
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={printer.name}
      description={`Spec sheet · ${model.fullName}`}
      width="lg"
    >
      <dl className="grid gap-x-8 sm:grid-cols-2">
        {rows(model).map((row) => (
          <div key={row.label} className="flex flex-col gap-0.5 border-t border-rule-soft py-3">
            <dt className="label-mono text-ink-muted">{row.label}</dt>
            <dd className="figure text-[18px] font-medium">
              {row.value ?? (
                <span className="text-[15px] font-normal text-steel">Not in the catalog</span>
              )}
            </dd>
            {row.note && row.value && <dd className="text-[13px] text-ink-muted">{row.note}</dd>}
          </div>
        ))}
        <div className="flex flex-col gap-0.5 border-t border-rule-soft py-3">
          <dt className="label-mono text-ink-muted">Your average power</dt>
          <dd className="figure text-[18px] font-medium">
            {printer.powerWatts !== null ? (
              `${printer.powerWatts} W`
            ) : (
              <span className="text-[15px] font-normal text-steel">Not set</span>
            )}
          </dd>
          <dd className="text-[13px] text-ink-muted">Used for energy cost in the calculator.</dd>
        </div>
      </dl>
      <p className="text-[13px] text-ink-muted">
        Source:{' '}
        <a
          href={PRINTER_CATALOG_ATTRIBUTION.url}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-teal"
        >
          {PRINTER_CATALOG_ATTRIBUTION.name}
        </a>
        , licensed under{' '}
        <a
          href={PRINTER_CATALOG_ATTRIBUTION.licenseUrl}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-teal"
        >
          {PRINTER_CATALOG_ATTRIBUTION.license}
        </a>
        . {PRINTER_CATALOG_ATTRIBUTION.note}
      </p>
    </Modal>
  );
}
