import type { LabelView } from '@printbi/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '../../test/render';
import { LabelPicker } from './LabelPicker';

const labels: LabelView[] = [
  {
    id: 'aaaaaaaaaaaaaaaaaaaaaaa1',
    name: 'Keychain',
    color: '#E2F1F3',
    archived: false,
    productCount: 2,
  },
  {
    id: 'aaaaaaaaaaaaaaaaaaaaaaa2',
    name: 'Old line',
    color: '#FEF0E6',
    archived: true,
    productCount: 0,
  },
];

function Harness({ onChange }: { onChange: (ids: string[]) => void }) {
  const [value, setValue] = useState<string[]>([]);
  return (
    <LabelPicker
      labels={labels}
      value={value}
      onChange={(ids) => {
        setValue(ids);
        onChange(ids);
      }}
    />
  );
}

function mockApi() {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url === '/api/v1/labels' && init.method === 'POST') {
        return new Response(
          JSON.stringify({ id: 'ccccccccccccccccccccccc1', name: 'Vase', color: '#FEF0E6' }),
          { status: 201 },
        );
      }
      return new Response('[]', { status: 200 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('LabelPicker', () => {
  it('toggles labels and hides archived ones the product does not carry', async () => {
    mockApi();
    const onChange = vi.fn();
    renderWithApp(<Harness onChange={onChange} />);
    expect(screen.queryByRole('button', { name: /old line/i })).not.toBeInTheDocument();
    const keychain = screen.getByRole('button', { name: 'Keychain' });
    await userEvent.click(keychain);
    expect(keychain).toHaveAttribute('aria-pressed', 'true');
    expect(onChange).toHaveBeenLastCalledWith(['aaaaaaaaaaaaaaaaaaaaaaa1']);
    await userEvent.click(keychain);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('creates a new label inline and selects it', async () => {
    const calls = mockApi();
    const onChange = vi.fn();
    renderWithApp(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'New label' }));
    await userEvent.type(screen.getByLabelText('Label name'), 'Vase{Enter}');
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(['ccccccccccccccccccccccc1']));
    const post = calls.find((c) => c.init.method === 'POST');
    expect(JSON.parse(String(post?.init.body))).toEqual({ name: 'Vase', color: '#FEF0E6' });
  });

  it('selects an existing label instead of creating a duplicate', async () => {
    const calls = mockApi();
    const onChange = vi.fn();
    renderWithApp(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'New label' }));
    await userEvent.type(screen.getByLabelText('Label name'), 'keychain');
    await userEvent.click(screen.getByRole('button', { name: 'Add label' }));
    expect(onChange).toHaveBeenLastCalledWith(['aaaaaaaaaaaaaaaaaaaaaaa1']);
    expect(calls.some((c) => c.init.method === 'POST')).toBe(false);
  });
});
