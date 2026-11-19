import { purchaseLineSchema, type InventoryItemView } from '@printbi/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '../../test/render';
import {
  applyBulk,
  existingMatch,
  FilamentPurchase,
  linePayload,
  type CartLine,
} from './FilamentPurchase';
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

  it('bulk changes apply only the fields that were filled', () => {
    const changed = applyBulk(blackLine, {
      price: '18.5',
      currency: 'BRL',
      originalQuantity: '',
      rolls: '',
      lowStockThreshold: '150',
    });
    expect(changed).toMatchObject({
      price: '18.5',
      currency: 'BRL',
      originalQuantity: '1000',
      rolls: 2,
      lowStockThreshold: '150',
    });
  });
});

describe('FilamentPurchase', () => {
  let calls: { url: string; init: RequestInit }[];
  beforeEach(() => {
    calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        if (url.startsWith('/api/v1/inventory/purchases'))
          return new Response('[{"id":"a"}]', { status: 201 });
        if (url.startsWith('/api/v1/inventory/items')) return new Response('[]', { status: 200 });
        return new Response('{}', { status: 200 });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  async function addRoll(color: string, price = '20') {
    await userEvent.clear(screen.getByLabelText(/^brand/i));
    await userEvent.type(screen.getByLabelText(/^brand/i), 'Bambu Lab');
    const search = screen.getAllByLabelText(/search colors/i)[0] as HTMLElement;
    await userEvent.clear(search);
    await userEvent.type(search, color.toLowerCase());
    await userEvent.click(screen.getByRole('button', { name: color }));
    const priceField = screen.getByLabelText(/price per roll/i);
    await userEvent.clear(priceField);
    if (price) await userEvent.type(priceField, price);
    await userEvent.click(screen.getByRole('button', { name: /add to purchase/i }));
  }

  it('requires the price before a roll joins the purchase', async () => {
    renderWithApp(<FilamentPurchase currency="CAD" categories={[]} products={[]} />);
    await addRoll('Jet Black', '');
    expect(await screen.findByText('Enter the price paid for each roll')).toBeInTheDocument();
    expect(screen.getByText('Nothing added yet')).toBeInTheDocument();
  });

  it('duplicates a roll with another color, then saves everything together', async () => {
    renderWithApp(<FilamentPurchase currency="CAD" categories={[]} products={[]} />);
    await addRoll('Jet Black');
    expect(await screen.findByText('Bambu Lab PLA Jet Black')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Duplicate Bambu Lab PLA Jet Black' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Choose the color' });
    await userEvent.type(within(dialog).getByLabelText(/search colors/i), 'hot pink');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hot Pink' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Use this color' }));
    const pink = (await screen.findByText('Bambu Lab PLA Hot Pink')).closest('li') as HTMLElement;
    await userEvent.click(within(pink).getByRole('button', { name: /one roll more/i }));

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

  it('selects all rolls and changes their price at once', async () => {
    renderWithApp(<FilamentPurchase currency="CAD" categories={[]} products={[]} />);
    await addRoll('Jet Black');
    await addRoll('Cold White');
    await addRoll('Hot Pink');

    await userEvent.click(screen.getByLabelText('Select all'));
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    const bar = screen.getByRole('region', { name: 'Change 3 selected rolls' });
    await userEvent.type(within(bar).getByLabelText(/price per roll/i), '18');
    await userEvent.click(within(bar).getByRole('button', { name: 'Apply to selected' }));

    expect(screen.getAllByText(/CAD 18$/)).toHaveLength(3);
    expect(screen.getByText(/CAD 54\.00/)).toBeInTheDocument();
  });

  it('selects rolls one by one to remove them', async () => {
    renderWithApp(<FilamentPurchase currency="CAD" categories={[]} products={[]} />);
    await addRoll('Jet Black');
    await addRoll('Cold White');
    await userEvent.click(screen.getByLabelText('Select Bambu Lab PLA Cold White'));
    const bar = screen.getByRole('region', { name: 'Change 1 selected rolls' });
    await userEvent.click(within(bar).getByRole('button', { name: /remove selected/i }));
    expect(screen.queryByText('Bambu Lab PLA Cold White')).not.toBeInTheDocument();
    expect(screen.getByText('Bambu Lab PLA Jet Black')).toBeInTheDocument();
  });
});
