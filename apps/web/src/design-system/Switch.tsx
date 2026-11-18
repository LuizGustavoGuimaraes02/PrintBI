import { Switch as RadixSwitch } from 'radix-ui';
import { useId } from 'react';

interface SwitchFieldProps {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function SwitchField({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: SwitchFieldProps) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="font-semibold">
          {label}
        </label>
        {description && (
          <p id={`${id}-desc`} className="text-sm text-ink-muted">
            {description}
          </p>
        )}
      </div>
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={description ? `${id}-desc` : undefined}
        className="relative mt-0.5 inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full bg-rule transition-colors data-[state=checked]:bg-teal disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RadixSwitch.Thumb className="block size-6 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-7" />
      </RadixSwitch.Root>
    </div>
  );
}
