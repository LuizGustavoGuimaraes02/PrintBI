/**
 * Pricing formulas shared by the API and the web app, on micro-unit integers.
 * Each function returns null instead of dividing by zero or producing nonsense.
 */
import { divide, multiply, sum, toMicro, type Micro } from './money';

const HUNDRED = toMicro('100');

export type MaintenanceInput =
  { kind: 'amount'; amount: Micro } | { kind: 'percent'; percent: Micro };

export interface MachineRateInput {
  purchase: Micro;
  maintenance: MaintenanceInput;
  years: Micro;
  daysPerYear: Micro;
  hoursPerDay: Micro;
}

/** Hours the printer is expected to work while it pays itself back. */
export function plannedHours({
  years,
  daysPerYear,
  hoursPerDay,
}: Omit<MachineRateInput, 'purchase' | 'maintenance'>): Micro {
  return multiply(multiply(years, daysPerYear), hoursPerDay);
}

/** Lifetime maintenance as an amount, from either an amount or a % of the purchase price. */
export function maintenanceAmount(purchase: Micro, maintenance: MaintenanceInput): Micro {
  return maintenance.kind === 'amount'
    ? maintenance.amount
    : multiply(purchase, divide(maintenance.percent, HUNDRED));
}

/**
 * Machine cost per print hour = (purchase + lifetime maintenance) ÷ planned hours.
 * A pricing allocation, not a cash payment.
 */
export function machineRatePerHour(input: MachineRateInput): Micro | null {
  const hours = plannedHours(input);
  if (hours <= 0 || input.purchase < 0) return null;
  return divide(sum([input.purchase, maintenanceAmount(input.purchase, input.maintenance)]), hours);
}
