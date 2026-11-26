import { Tooltip } from 'radix-ui';
import type { ReactElement, ReactNode } from 'react';

interface HintProps {
  /** What clicking will do, in a sentence: shown on hover and keyboard focus. */
  text: ReactNode;
  /** One focusable element (a button or a link). */
  children: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * Explains an action before it happens. Touch screens show no hover, so anything that matters
 * (a stock deduction, a deletion) must still be said in the dialog that follows.
 */
export function Hint({ text, children, side = 'top' }: HintProps) {
  return (
    <Tooltip.Provider delayDuration={350}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side={side}
            sideOffset={6}
            collisionPadding={12}
            className="z-[60] max-w-[280px] rounded-[12px] bg-ink px-3 py-2 text-[13px] leading-snug text-white shadow-[var(--shadow-pop)] motion-safe:animate-fade-in"
          >
            {text}
            <Tooltip.Arrow className="fill-ink" width={12} height={6} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
