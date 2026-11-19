import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '../../test/render';
import { CustomerDialog } from './CustomerDialog';
import { whatsappLink } from './queries';

function mockApi() {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const body = JSON.parse(String(init.body ?? '{}')) as object;
      return new Response(
        JSON.stringify({ id: 'aaaaaaaaaaaaaaaaaaaaaaa1', ...body, createdAt: '2026-11-18' }),
        { status: 201 },
      );
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('CustomerDialog', () => {
  it('needs only a name and checks the email before sending', async () => {
    const calls = mockApi();
    renderWithApp(<CustomerDialog onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add customer' }));
    expect(await screen.findByText('Enter a name')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Name/), 'Ana');
    await userEvent.type(screen.getByLabelText('Email'), 'ana@');
    await userEvent.click(screen.getByRole('button', { name: 'Add customer' }));
    expect(await screen.findByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(calls).toHaveLength(0);
  });

  it('creates the customer and hands it back to the caller', async () => {
    const calls = mockApi();
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderWithApp(<CustomerDialog initialName="Ana" onSaved={onSaved} onClose={onClose} />);
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Ana');
    await userEvent.type(screen.getByLabelText(/phone or whatsapp/i), '+55 11 98888-7777');
    await userEvent.click(screen.getByRole('button', { name: 'Add customer' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ana' }));
    expect(calls[0]?.url).toBe('/api/v1/customers');
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      name: 'Ana',
      phone: '+55 11 98888-7777',
      email: '',
    });
  });
});

describe('whatsappLink', () => {
  it('keeps only digits and ignores numbers too short to dial', () => {
    expect(whatsappLink('+55 (11) 98888-7777')).toBe('https://wa.me/5511988887777');
    expect(whatsappLink('123')).toBeNull();
  });
});
