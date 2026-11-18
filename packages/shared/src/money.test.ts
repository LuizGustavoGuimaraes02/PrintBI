import { describe, expect, it } from 'vitest';
import {
  divide,
  formatMoney,
  money,
  MoneyError,
  multiply,
  parseDecimal,
  roundToCents,
  sum,
  sumMoney,
  toDecimalString,
  toMicro,
} from './money';

describe('parseDecimal / toMicro', () => {
  it('parses integers and decimals exactly', () => {
    expect(parseDecimal('25')).toBe(25_000_000);
    expect(parseDecimal('0.025')).toBe(25_000);
    expect(parseDecimal('-3.5')).toBe(-3_500_000);
    expect(parseDecimal(' 1000 ')).toBe(1_000_000_000);
  });

  it('rounds beyond 6 decimals half-up', () => {
    expect(parseDecimal('0.0000005')).toBe(1);
    expect(parseDecimal('0.0000004999')).toBe(0);
    expect(parseDecimal('-0.0000005')).toBe(-1);
  });

  it('rejects invalid input', () => {
    for (const bad of ['', 'abc', '1,5', '1.2.3', '.5', '1e3']) {
      expect(() => parseDecimal(bad)).toThrow(MoneyError);
    }
  });

  it('converts JS numbers without float artifacts', () => {
    expect(toMicro(0.1 + 0.2)).toBe(300_000);
    expect(toMicro(25)).toBe(25_000_000);
    expect(() => toMicro(Number.NaN)).toThrow(MoneyError);
  });

  it('round-trips through toDecimalString', () => {
    expect(toDecimalString(25_000)).toBe('0.025');
    expect(toDecimalString(25_000_000)).toBe('25');
    expect(toDecimalString(-3_500_000)).toBe('-3.5');
    expect(toDecimalString(parseDecimal('123.456789'))).toBe('123.456789');
  });
});

describe('arithmetic', () => {
  it('computes cost per gram from the spec example (CAD 25 / 1000 g)', () => {
    const costPerGram = divide(toMicro('25'), toMicro('1000'));
    expect(costPerGram).toBe(25_000); // 0.025
    expect(multiply(costPerGram, toMicro('100'))).toBe(2_500_000); // 100 g → 2.50
  });

  it('computes cost per unit (100 screws for CAD 10, 4 used)', () => {
    const perScrew = divide(toMicro('10'), toMicro('100'));
    expect(multiply(perScrew, toMicro('4'))).toBe(400_000); // 0.40
  });

  it('rounds division half-up', () => {
    expect(divide(toMicro('10'), toMicro('3'))).toBe(3_333_333);
    expect(divide(toMicro('20'), toMicro('3'))).toBe(6_666_667);
    expect(divide(toMicro('-20'), toMicro('3'))).toBe(-6_666_667);
  });

  it('refuses division by zero', () => {
    expect(() => divide(toMicro('1'), 0)).toThrow(MoneyError);
  });

  it('keeps precision on large products via BigInt', () => {
    // The intermediate product (5e10 × 1e9 = 5e19) exceeds 2^53; BigInt keeps it exact.
    expect(multiply(toMicro('50000'), toMicro('1000'))).toBe(toMicro('50000000'));
  });

  it('refuses results beyond the safe range instead of losing precision', () => {
    expect(() => multiply(toMicro('50000'), toMicro('1000000'))).toThrow(/safe range/);
  });

  it('sums exactly', () => {
    expect(sum([toMicro('0.1'), toMicro('0.2')])).toBe(toMicro('0.3'));
    expect(sum([])).toBe(0);
  });

  it('rejects non-integer micro values', () => {
    expect(() => sum([1.5])).toThrow(MoneyError);
  });
});

describe('roundToCents', () => {
  it('rounds half-up to the nearest cent', () => {
    expect(roundToCents(toMicro('2.344999'))).toBe(toMicro('2.34'));
    expect(roundToCents(toMicro('2.345'))).toBe(toMicro('2.35'));
    expect(roundToCents(toMicro('-2.345'))).toBe(toMicro('-2.35'));
    expect(roundToCents(toMicro('0.09'))).toBe(toMicro('0.09'));
  });
});

describe('Money', () => {
  it('sums same-currency amounts', () => {
    const total = sumMoney([money(toMicro('3'), 'CAD'), money(toMicro('0.8'), 'CAD')], 'CAD');
    expect(total).toEqual({ amount: toMicro('3.8'), currency: 'CAD' });
  });

  it('never adds CAD and BRL silently', () => {
    expect(() => sumMoney([money(toMicro('1'), 'CAD'), money(toMicro('4'), 'BRL')], 'CAD')).toThrow(
      /conversion rate/,
    );
  });

  it('formats with an explicit currency code, rounded to cents by default', () => {
    expect(formatMoney(money(toMicro('1200'), 'CAD'))).toMatch(/^CAD\s1,200\.00$/);
    expect(formatMoney(money(toMicro('400.5'), 'BRL'))).toMatch(/^BRL\s400,50$/);
    expect(formatMoney(money(toMicro('2.345'), 'CAD'))).toMatch(/^CAD\s2\.35$/);
  });

  it('can show the symbol instead of the code', () => {
    expect(formatMoney(money(toMicro('1200'), 'CAD'), { display: 'symbol' })).toBe('$1,200.00');
    expect(formatMoney(money(toMicro('400.5'), 'BRL'), { display: 'symbol' })).toMatch(
      /^R\$\s400,50$/,
    );
  });

  it('formats unit costs with more precision when asked', () => {
    expect(formatMoney(money(toMicro('0.025'), 'CAD'), { precision: 'unit' })).toMatch(
      /^CAD\s0\.025$/,
    );
  });
});
