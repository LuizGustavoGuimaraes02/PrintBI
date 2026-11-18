import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ToastProvider } from '../design-system';

/** Renders a screen inside the real providers, with a memory router. */
export function renderWithApp(
  element: ReactElement,
  { path = '/', url }: { path?: string; url?: string } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path, element },
      { path: '*', element: <p>Navigated away</p> },
    ],
    { initialEntries: [url ?? path] },
  );
  return {
    queryClient,
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  };
}
