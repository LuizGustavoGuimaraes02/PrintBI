import { useCallback, useState } from 'react';

const freshKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * One key per user operation. Retries of the same submit reuse it (the server then
 * replays instead of writing twice); call `renew` after a success to start a new one.
 */
export function useIdempotencyKey() {
  const [key, setKey] = useState(freshKey);
  const renew = useCallback(() => setKey(freshKey()), []);
  return { key, renew, headers: { 'Idempotency-Key': key } };
}
