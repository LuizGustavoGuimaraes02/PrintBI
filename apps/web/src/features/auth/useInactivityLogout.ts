import { useEffect, useRef, useState } from 'react';
import { refreshSession } from '../../lib/api';

const IDLE_LIMIT_MS = 30 * 60_000;
const WARNING_MS = 2 * 60_000;
const HEARTBEAT_MS = 10 * 60_000;
const STORAGE_KEY = 'pb-last-activity';
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

function readShared(): number {
  try {
    return Number(window.localStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeShared(time: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(time));
  } catch {
    // Storage can be unavailable (private mode); this tab still tracks itself.
  }
}

/**
 * Signs out after 30 minutes without interaction, with a two-minute warning.
 * Activity in any open tab counts. While the user is active, the session is
 * renewed every 10 minutes so the server-side idle limit never cuts them off.
 */
export function useInactivityLogout(enabled: boolean, onTimeout: () => void) {
  const lastActivity = useRef(0);
  const lastRefresh = useRef(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const timeoutRef = useRef(onTimeout);
  useEffect(() => {
    timeoutRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    if (!enabled) return;
    lastActivity.current = Date.now();
    lastRefresh.current = Date.now();
    writeShared(lastActivity.current);

    let lastWrite = 0;
    const markActive = () => {
      const now = Date.now();
      lastActivity.current = now;
      if (now - lastWrite > 5_000) {
        lastWrite = now;
        writeShared(now);
      }
    };
    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, markActive, { passive: true }),
    );

    const tick = window.setInterval(() => {
      const now = Date.now();
      const last = Math.max(lastActivity.current, readShared());
      const idle = now - last;

      if (idle >= IDLE_LIMIT_MS) {
        setSecondsLeft(null);
        timeoutRef.current();
        return;
      }
      setSecondsLeft(
        idle >= IDLE_LIMIT_MS - WARNING_MS ? Math.ceil((IDLE_LIMIT_MS - idle) / 1000) : null,
      );

      if (idle < HEARTBEAT_MS && now - lastRefresh.current >= HEARTBEAT_MS) {
        lastRefresh.current = now;
        void refreshSession();
      }
    }, 1_000);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, markActive));
      window.clearInterval(tick);
    };
  }, [enabled]);

  const stayActive = () => {
    lastActivity.current = Date.now();
    writeShared(lastActivity.current);
    setSecondsLeft(null);
  };

  return { secondsLeft, stayActive };
}
