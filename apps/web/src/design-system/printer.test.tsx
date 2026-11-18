import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FilamentBar, NozzleLoader, SpoolGauge } from './printer';

describe('printer components', () => {
  it('the loader is announced as a status', () => {
    render(<NozzleLoader label="Loading orders" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading orders');
  });

  it('the spool gauge describes how much is left', () => {
    render(<SpoolGauge remaining={750} capacity={1000} color="#1F2328" />);
    expect(screen.getByRole('img', { name: 'Spool with 75% left' })).toBeInTheDocument();
  });

  it('the filament bar exposes its value as a meter', () => {
    render(<FilamentBar value={85} max={1000} label="PLA Black" readout="85 g" attention />);
    const meter = screen.getByRole('meter', { name: 'PLA Black' });
    expect(meter).toHaveAttribute('aria-valuenow', '85');
  });
});
