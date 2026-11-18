import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '../../test/render';
import { LoginPage } from './LoginPage';

afterEach(() => vi.unstubAllGlobals());

describe('LoginPage', () => {
  it('validates with the shared rules before calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderWithApp(<LoginPage />, { path: '/login' });

    await userEvent.type(screen.getByLabelText(/email/i), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the server message when credentials are wrong', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ message: 'Incorrect email or password', code: 'UNAUTHORIZED' }),
            { status: 401 },
          ),
        ),
    );
    renderWithApp(<LoginPage />, { path: '/login' });

    await userEvent.type(screen.getByLabelText(/email/i), 'luiz@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong-pass1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Incorrect email or password')).toBeInTheDocument();
  });

  it('explains why the user was signed out', () => {
    renderWithApp(<LoginPage />, { path: '/login', url: '/login?reason=idle' });
    expect(screen.getByText(/30 minutes without activity/)).toBeInTheDocument();
  });
});
