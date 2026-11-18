import type { InventoryItemView } from '@printbi/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '../../test/render';
import { ConsumeDialog } from './ConsumeDialog';

const G = 1_000_000;
const item: InventoryItemView = {
  id: 'aaaaaaaaaaaaaaaaaaaaaaa1',
  kind: 'filament',
  name: 'PLA Black',
  unit: 'g',
  customUnit: '',
  category: '',
  description: '',
  filament: {
    productId: null,
    materialType: 'PLA',
    brand: '',
    colorKey: 'black',
    colorName: 'Black',
    colorHex: null,
    diameterMm: 1.75,
    densityGcm3: null,
    nozzleTempMin: null,
    nozzleTempMax: null,
    bedTempMin: null,
    bedTempMax: null,
  },
  lowStockThreshold: null,
  notes: '',
  archived: false,
  remaining: 80 * G,
  activeLots: 1,
  lowLots: 1,
  low: false,
  out: false,
  value: null,
  lots: [
    {
      id: 'bbbbbbbbbbbbbbbbbbbbbbb1',
      label: 'Roll 2',
      originalQuantity: 1000 * G,
      remaining: 80 * G,
      status: 'in_use',
      purchasedAt: null,
      openedAt: null,
      store: '',
      notes: '',
      totalCost: null,
      unitCost: null,
      expenseId: null,
      used: true,
      lowStockThreshold: null,
      effectiveLowStockThreshold: 100 * G,
      low: true,
    },
  ],
  updatedAt: '2026-11-18T00:00:00.000Z',
};

function mockApi() {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.startsWith('/api/v1/inventory/items'))
        return new Response(JSON.stringify([item]), { status: 200 });
      if (url === '/api/v1/inventory/consumptions') {
        return new Response(JSON.stringify([{ delta: -50 * G, balanceAfter: 30 * G }]), {
          status: 201,
        });
      }
      return new Response('{}', { status: 200 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('ConsumeDialog', () => {
  it('warns when a line needs more than the roll holds', async () => {
    mockApi();
    renderWithApp(<ConsumeDialog itemId="aaaaaaaaaaaaaaaaaaaaaaa1" onClose={vi.fn()} />);
    const quantity = await screen.findByLabelText(/quantity/i);
    await waitFor(() =>
      expect(screen.getByLabelText(/roll or lot/i)).toHaveValue('bbbbbbbbbbbbbbbbbbbbbbb1'),
    );
    await userEvent.type(quantity, '150');
    expect(screen.getByText('Only 80 g left')).toBeInTheDocument();
    expect(screen.getByText(/split it/i)).toBeInTheDocument();
  });

  it('deducts with an idempotency key and closes', async () => {
    const calls = mockApi();
    const onClose = vi.fn();
    renderWithApp(<ConsumeDialog itemId="aaaaaaaaaaaaaaaaaaaaaaa1" onClose={onClose} />);
    await waitFor(() =>
      expect(screen.getByLabelText(/roll or lot/i)).toHaveValue('bbbbbbbbbbbbbbbbbbbbbbb1'),
    );
    await userEvent.type(screen.getByLabelText(/quantity/i), '50');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and deduct' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const post = calls.find((c) => c.url === '/api/v1/inventory/consumptions');
    expect((post?.init.headers as Record<string, string>)['Idempotency-Key']).toMatch(/.{8,}/);
    expect(JSON.parse(String(post?.init.body))).toMatchObject({
      type: 'consumption',
      lines: [
        { itemId: 'aaaaaaaaaaaaaaaaaaaaaaa1', lotId: 'bbbbbbbbbbbbbbbbbbbbbbb1', quantity: '50' },
      ],
    });
  });
});
