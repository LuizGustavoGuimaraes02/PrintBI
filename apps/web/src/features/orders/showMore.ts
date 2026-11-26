import { useState } from 'react';
import { useAccount } from '../auth/account';

const storageKey = (userId: string | undefined) => `printbi.order-form.more.${userId ?? 'guest'}`;

function stored(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/**
 * Whether the order window shows its extra properties (price, payment, labels…). Each
 * person's last choice is kept in this browser; it starts with the short list.
 */
export function useShowMore(): [boolean, (more: boolean) => void] {
  const { data } = useAccount();
  const key = storageKey(data?.user.id);
  const [more, setMore] = useState(() => stored(key));
  const change = (next: boolean) => {
    setMore(next);
    try {
      window.localStorage.setItem(key, next ? '1' : '0');
    } catch {
      /* private window: the choice lasts until the page closes */
    }
  };
  return [more, change];
}
