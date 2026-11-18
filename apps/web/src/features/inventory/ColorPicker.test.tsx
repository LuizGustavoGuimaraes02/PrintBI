import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ColorPicker, type ColorValue } from './ColorPicker';

function Harness({
  initial = { colorKey: '', colorName: '', colorHex: '' },
}: {
  initial?: ColorValue;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <ColorPicker value={value} onChange={setValue} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

describe('ColorPicker', () => {
  it('finds special finishes and picks one from the catalog', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText(/search colors/i), 'fluorescent green');
    await userEvent.click(screen.getByRole('button', { name: 'Fluorescent Green' }));
    expect(screen.getByTestId('value')).toHaveTextContent(
      '"colorKey":"fluorescent-green","colorName":"Fluorescent Green"',
    );
  });

  it('filters by family', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Metallic' }));
    expect(screen.getByRole('button', { name: 'Silk Gold' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hot Pink' })).not.toBeInTheDocument();
  });

  it('allows a custom color with its own name', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Custom color' }));
    await userEvent.type(screen.getByLabelText(/color name/i), 'Galaxy Teal');
    expect(screen.getByTestId('value')).toHaveTextContent(
      '"colorKey":"","colorName":"Galaxy Teal","colorHex":"#888888"',
    );
  });
});
