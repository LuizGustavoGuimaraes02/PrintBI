import type { PrinterModelView } from '@printbi/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PrinterModelPicker, searchModels } from './PrinterModelPicker';

const model = (
  id: string,
  brand: string,
  name: string,
  extra: Partial<PrinterModelView> = {},
): PrinterModelView => ({
  id,
  brand,
  model: name,
  fullName: `${brand} ${name}`,
  buildVolumeMm: null,
  buildVolumeCm3: null,
  nozzleDiameterMm: null,
  maxSpeedMmS: null,
  ratedPowerW: null,
  heaterPowerW: null,
  typicalNozzleTempC: null,
  typicalBedTempC: null,
  typicalPriceEur: null,
  maintenanceEurPerYear: null,
  ...extra,
});

const models = [
  model('1', 'Bambu Lab', 'A1 Mini', { typicalNozzleTempC: 220, typicalBedTempC: 60 }),
  model('2', 'Bambu Lab', 'P1S'),
  model('3', 'Creality', 'K1 Max'),
  model('4', 'Elegoo', 'Neptune 4'),
];

describe('searchModels', () => {
  it('matches every typed word anywhere in brand and model', () => {
    expect(searchModels(models, 'bambu a1').map((m) => m.id)).toEqual(['1']);
    expect(searchModels(models, 'k1 max').map((m) => m.id)).toEqual(['3']);
    expect(searchModels(models, 'NEPTUNE').map((m) => m.id)).toEqual(['4']);
  });

  it('lists everything for an empty query and nothing for a miss', () => {
    expect(searchModels(models, '')).toHaveLength(4);
    expect(searchModels(models, 'voron')).toEqual([]);
  });
});

describe('PrinterModelPicker', () => {
  it('selects a model with the keyboard', async () => {
    const onSelect = vi.fn();
    render(<PrinterModelPicker models={models} selected={null} onSelect={onSelect} />);
    const input = screen.getByRole('combobox', { name: /find your printer model/i });

    await userEvent.type(input, 'bambu');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    await userEvent.keyboard('{ArrowDown}{Enter}');

    expect(onSelect).toHaveBeenCalledWith(models[1]);
  });

  it('always offers typing the printer by hand', async () => {
    render(<PrinterModelPicker models={models} selected={null} onSelect={vi.fn()} />);
    expect(
      screen.getByText(/not in the list\? skip this and fill the fields below by hand/i),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByRole('combobox'), 'my own build');
    expect(screen.getByText(/no model matches/i)).toBeInTheDocument();
  });

  it('shows the chosen model and lets the user unlink it', async () => {
    const onSelect = vi.fn();
    render(<PrinterModelPicker models={models} selected={models[0] ?? null} onSelect={onSelect} />);
    expect(screen.getByText('Bambu Lab A1 Mini')).toBeInTheDocument();
    expect(screen.getByText('220 / 60 °C')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /remove bambu lab a1 mini/i }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
