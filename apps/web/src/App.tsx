import { useEffect, useState } from 'react';

type ApiStatus = 'checking' | 'online' | 'offline';

/**
 * Part 0 only: confirms the web app reaches the API through the dev proxy.
 * Replaced by the real app shell in Part 2.
 */
export function App() {
  const [status, setStatus] = useState<ApiStatus>('checking');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/health/ready', { signal: controller.signal })
      .then((res) => setStatus(res.ok ? 'online' : 'offline'))
      .catch(() => {
        if (!controller.signal.aborted) setStatus('offline');
      });
    return () => controller.abort();
  }, []);

  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        padding: '3rem 1rem',
        maxWidth: 640,
        margin: '0 auto',
      }}
    >
      <h1>PrintBI</h1>
      <p role="status">API: {status}</p>
    </main>
  );
}
