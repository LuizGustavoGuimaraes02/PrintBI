import { purchaseLineSchema, type InventoryItemView } from '@printbi/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '../../test/render';
import { existingMatch, FilamentPurchase, linePayload, type CartLine } from './FilamentPurchase';
import { emptyItem } from './forms';

const blackLine: CartLine = {
  id: 1,
  item: {
    ...emptyItem('filament'),
    brand: 'Bambu Lab',
    materialType: 'PLA',
    colorKey: 'black',
    colorName: 'Black',
  },
  rolls: 2,
  originalQuantity: '1000',
  price: '20',
  currency: 'CAD',
  lowStockThreshold: '',
};

describe('purchase lines', () => {
  it('become payloads the shared schema accepts, named automatically', () => {
    const payload = linePayload(blackLine, true);
    expect(purchaseLineSchema.safeParse(payload).success).toBe(true);
    expect(payload).toMatchObject({
      rolls: 2,
      totalCost: { amount: '20', currency: 'CAD' },
      lowStockThreshold: null,
    });
    expect(payload.item.name).toBe('Bambu Lab PLA Black');
  });

  it('drop prices for members without financial access', () => {
    expect(linePayload(blackLine, false).totalCost).toBeNull();
  });

  it('recognise a filament already in stock by material, brand, color and diameter', () => {
    const stocked = {
      id: 'x',
      name: 'Bambu Lab PLA Black',
      archived: false,
      filament: {
        materialType: 'pla',
        brand: 'bambu lab',
        colorKey: 'black',
        colorHex: null,
        diameterMm: 1.75,
      },
    } as unknown as InventoryItemView;
    expect(existingMatch([stocked], blackLine.item)?.id).toBe('x');
    expect(existingMatch([stocked], { ...blackLine.item, colorKey: 'white' })).toBeUndefined();
  });
});

describe('FilamentPurchase', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('adds a roll, duplicates it with another color and saves both together', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        if (url.startsWith('/api/v1/inventory/purchases'))
          return new Response('[{"id":"a"},{"id":"b"}]', { status: 201 });
        if (url.startsWith('/api/v1/inventory/items')) return new Response('[]', { status: 200 });
        if (url.includes('/settings'))
          return new Response(
            JSON.stringify({ inventory: { rollLowStockThreshold: 100_000_000 } }),
            { status: 200 },
          );
        if (url.includes('/auth/me'))
          return new Response(
            JSON.stringify({ activeCompany: { permissions: ['finance:view', 'finance:manage'] } }),
            { status: 200 },
          );
        return new Response('{}', { status: 200 });
      }),
    );
    renderWithApp(<FilamentPurchase currency="CAD" categories={[]} products={[]} />);

    await userEvent.type(screen.getByLabelText(/^brand/i), 'Bambu Lab');
    await userEvent.type(screen.getByLabelText(/search colors/i), 'jet black');
    await userEvent.click(screen.getByRole('button', { name: 'Jet Black' }));
    await userEvent.click(screen.getByRole('button', { name: /add to purchase/i }));

    expect(await screen.findByText('Bambu Lab PLA Jet Black')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    await userEvent.clear(screen.getByLabelText(/search colors/i));
    await userEvent.type(screen.getByLabelText(/search colors/i), 'hot pink');
    await userEvent.click(screen.getByRole('button', { name: 'Hot Pink' }));
    await userEvent.click(screen.getByRole('button', { name: /update line/i }));
    expect(await screen.findByText('Bambu Lab PLA Hot Pink')).toBeInTheDocument();

    // Two rolls of hot pink.
    const pinkRow = screen.getByText('Bambu Lab PLA Hot Pink').closest('li') as HTMLElement;
    await userEvent.click(within(pinkRow).getByRole('button', { name: /one roll more/i }));

    await userEvent.click(screen.getByRole('button', { name: /save all \(3 rolls\)/i }));
    await waitFor(() =>
      expect(calls.some((c) => c.url === '/api/v1/inventory/purchases')).toBe(true),
    );
    const post = calls.find((c) => c.url === '/api/v1/inventory/purchases');
    const body = JSON.parse(String(post?.init.body));
    expect(
      body.lines.map((l: { item: { name: string }; rolls: number }) => [l.item.name, l.rolls]),
    ).toEqual([
      ['Bambu Lab PLA Jet Black', 1],
      ['Bambu Lab PLA Hot Pink', 2],
    ]);
    expect((post?.init.headers as Record<string, string>)['Idempotency-Key']).toBeTruthy();
  });
});
