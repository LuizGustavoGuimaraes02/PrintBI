import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

afterEach(() => vi.unstubAllGlobals());

describe('App', () => {
  it('shows the API as online when readiness succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    render(<App />);
    expect(await screen.findByText('API: online')).toBeDefined();
  });

  it('shows the API as offline when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    render(<App />);
    expect(await screen.findByText('API: offline')).toBeDefined();
  });
});
