import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInactivityLogout } from './useInactivityLogout';

vi.mock('../../lib/api', () => ({ refreshSession: vi.fn().mockResolvedValue(true) }));

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe('useInactivityLogout', () => {
  it('warns two minutes before and signs out after 30 idle minutes', () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useInactivityLogout(true, onTimeout));

    act(() => vi.advanceTimersByTime(27 * 60_000));
    expect(result.current.secondsLeft).toBeNull();

    act(() => vi.advanceTimersByTime(60_000 + 1_000));
    expect(result.current.secondsLeft).toBeGreaterThan(0);
    expect(onTimeout).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(2 * 60_000));
    expect(onTimeout).toHaveBeenCalled();
  });

  it('any interaction resets the clock', () => {
    const onTimeout = vi.fn();
    renderHook(() => useInactivityLogout(true, onTimeout));

    act(() => vi.advanceTimersByTime(25 * 60_000));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown'));
    });
    act(() => vi.advanceTimersByTime(25 * 60_000));
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('does nothing while signed out', () => {
    const onTimeout = vi.fn();
    renderHook(() => useInactivityLogout(false, onTimeout));
    act(() => vi.advanceTimersByTime(60 * 60_000));
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
