import { describe, expect, it } from 'vitest';
import { toMicro } from './money';
import { machineRatePerHour, maintenanceAmount, plannedHours } from './pricing';

const base = {
  purchase: toMicro('600'),
  years: toMicro('2'),
  daysPerYear: toMicro('300'),
  hoursPerDay: toMicro('8'),
};

describe('machine rate', () => {
  it('computes planned hours', () => {
    expect(plannedHours(base)).toBe(toMicro('4800'));
  });

  it('adds maintenance as an amount or a percentage', () => {
    expect(maintenanceAmount(base.purchase, { kind: 'amount', amount: toMicro('120') })).toBe(
      toMicro('120'),
    );
    expect(maintenanceAmount(base.purchase, { kind: 'percent', percent: toMicro('20') })).toBe(
      toMicro('120'),
    );
  });

  it('divides purchase plus maintenance by planned hours', () => {
    // (600 + 120) / 4800 h = 0.15 per hour
    expect(
      machineRatePerHour({ ...base, maintenance: { kind: 'percent', percent: toMicro('20') } }),
    ).toBe(toMicro('0.15'));
  });

  it('returns null instead of dividing by zero', () => {
    expect(
      machineRatePerHour({ ...base, hoursPerDay: 0, maintenance: { kind: 'amount', amount: 0 } }),
    ).toBeNull();
  });
});
