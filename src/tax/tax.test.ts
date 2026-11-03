import { describe, expect, it } from 'vitest';
import { TAX_2026, contributionMaximums } from './config';
import { bracketTax, computeAnnualFromEarnings, federalBpa, ontarioHealthPremium } from './annual';
import { payDates, simulatePayroll, type PayrollInput } from './payroll';
import { calculate, resolveRetirement, type CalculatorInput, type RetirementInput } from './calculator';

const cfg = TAX_2026;

const noDeductions = { rpp: 0, groupRrsp: 0, unionDues: 0, taxableBenefits: 0, postTax: 0 };

function payrollInput(overrides: Partial<PayrollInput> = {}): PayrollInput {
  return {
    annualSalary: 150_000,
    frequency: 'biweekly',
    firstPayDate: '2026-01-02',
    perPay: noDeductions,
    lumpSums: [],
    rsuWithholding: { method: 'bonus', flatRate: 0 },
    rsuSubjectToEi: true,
    rsuCppEiFromShares: false,
    ...overrides,
  };
}

function noRetirement(): RetirementInput {
  return {
    rpp: { mode: 'amount', value: 0 },
    groupRrsp: { mode: 'amount', value: 0 },
    match: { enabled: false, rate: 100, capPercent: 0, plan: 'rrsp', insurable: true },
    personalRrsp: 0,
  };
}

function calcInput(overrides: Partial<CalculatorInput> = {}): CalculatorInput {
  return {
    year: 2026,
    annualSalary: 150_000,
    frequency: 'biweekly',
    firstPayDate: '2026-01-02',
    perPay: { unionDues: 0, taxableBenefits: 0, postTax: 0 },
    retirement: noRetirement(),
    bonuses: [],
    rsuVests: [],
    rsuCurrency: 'CAD',
    usdCad: 1.4,
    rsuWithholding: { method: 'bonus', flatRate: 0 },
    rsuSubjectToEi: true,
    rsuCppEiFromShares: false,
    ...overrides,
  };
}

describe('2026 contribution maximums', () => {
  it('matches CRA published maximums', () => {
    const max = contributionMaximums(cfg);
    expect(max.cppMax).toBe(4230.45);
    expect(max.cpp2Max).toBe(416);
    expect(max.eiMax).toBe(1123.07);
  });
});

describe('annual building blocks', () => {
  it('computes bracket tax', () => {
    expect(bracketTax(58_523, cfg.federal.brackets)).toBeCloseTo(8193.22, 2);
    expect(bracketTax(0, cfg.federal.brackets)).toBe(0);
  });

  it('phases out the federal BPA', () => {
    expect(federalBpa(100_000, cfg)).toBe(16_452);
    expect(federalBpa(300_000, cfg)).toBe(14_829);
    expect(federalBpa((181_440 + 258_482) / 2, cfg)).toBeCloseTo((16_452 + 14_829) / 2, 6);
  });

  it('computes the Ontario Health Premium tiers', () => {
    expect(ontarioHealthPremium(20_000, cfg)).toBe(0);
    expect(ontarioHealthPremium(25_000, cfg)).toBe(300);
    expect(ontarioHealthPremium(40_000, cfg)).toBe(450);
    expect(ontarioHealthPremium(50_000, cfg)).toBe(600);
    expect(ontarioHealthPremium(72_500, cfg)).toBe(725);
    expect(ontarioHealthPremium(150_000, cfg)).toBe(750);
    expect(ontarioHealthPremium(250_000, cfg)).toBe(900);
  });
});

describe('annual return', () => {
  it('computes $100,000 of employment income (hand-checked)', () => {
    const r = computeAnnualFromEarnings(
      { employmentIncome: 100_000, insurableEarnings: 100_000, otherDeductions: 0 },
      cfg,
    );
    expect(r.cpp1).toBe(4230.45);
    expect(r.cpp2).toBe(416);
    expect(r.ei).toBe(1123.07);
    expect(r.enhancedCppDeduction).toBeCloseTo(1127.0, 1);
    expect(r.taxableIncome).toBeCloseTo(98_873, 0);
    expect(r.federal.tax).toBeCloseTo(13_301.6, 0);
    expect(r.ontario.basicTax).toBeCloseTo(5_946.96, 0);
    expect(r.ontario.surtax).toBeCloseTo(25.79, 0);
    expect(r.ontario.healthPremium).toBe(750);
    expect(r.totalIncomeTax).toBeCloseTo(20_024.35, 0);
  });

  it('applies the Ontario tax reduction and LIFT at low income', () => {
    const r = computeAnnualFromEarnings(
      { employmentIncome: 20_000, insurableEarnings: 20_000, otherDeductions: 0 },
      cfg,
    );
    expect(r.ontario.tax).toBe(0);
    expect(r.ontario.healthPremium).toBe(0);
  });
});

describe('payroll simulation', () => {
  it('builds 26 bi-weekly pay dates', () => {
    const dates = payDates('biweekly', 2026, '2026-01-02');
    expect(dates).toHaveLength(26);
    expect(dates[0]).toBe('2026-01-02');
    expect(dates[25]).toBe('2026-12-18');
  });

  it('pays exactly the annual salary across all paychecks', () => {
    for (const frequency of ['weekly', 'biweekly', 'semimonthly', 'monthly'] as const) {
      const r = simulatePayroll(payrollInput({ annualSalary: 120_000, frequency }), cfg);
      expect(r.totals.regularGross).toBe(120_000);
    }
  });

  it('stops CPP/CPP2/EI exactly at the annual maximums', () => {
    const r = simulatePayroll(payrollInput(), cfg);
    expect(r.totals.cpp).toBe(4230.45);
    expect(r.totals.cpp2).toBe(416);
    expect(r.totals.ei).toBe(1123.07);
    const kinds = r.events.map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['ei-max', 'cpp-max', 'cpp2-start', 'cpp2-max']));
    // EI's ceiling ($68,900) is below the YMPE ($74,600), so EI maxes out first.
    const ei = r.events.find((e) => e.kind === 'ei-max')!;
    const cpp = r.events.find((e) => e.kind === 'cpp-max')!;
    const cpp2 = r.events.find((e) => e.kind === 'cpp2-max')!;
    expect(ei.periodIndex).toBeLessThanOrEqual(cpp.periodIndex);
    expect(cpp.periodIndex).toBeLessThanOrEqual(cpp2.periodIndex);
    // After everything is maxed, no more contributions.
    const last = r.periods[r.periods.length - 1];
    expect(last.cpp + last.cpp2 + last.ei).toBe(0);
  });

  it('does not reach the maximums at low income', () => {
    const r = simulatePayroll(payrollInput({ annualSalary: 50_000 }), cfg);
    expect(r.events).toHaveLength(0);
    expect(r.totals.cpp).toBeCloseTo((50_000 - 3_500) * 0.0595, 0);
    expect(r.totals.ei).toBeCloseTo(50_000 * 0.0163, 0);
  });

  it('withholds close to the annual tax for a steady salary', () => {
    const res = calculate(calcInput({ annualSalary: 100_000 }));
    // Payroll formulas annualize each paycheck, so the year-end difference is small.
    expect(Math.abs(res.refund)).toBeLessThan(150);
  });

  it('pulls the maximums forward when an RSU vests', () => {
    const base = simulatePayroll(payrollInput({ annualSalary: 120_000 }), cfg);
    const withRsu = simulatePayroll(
      payrollInput({
        annualSalary: 120_000,
        lumpSums: [{ id: 'a', type: 'rsu', date: '2026-02-15', amount: 40_000 }],
      }),
      cfg,
    );
    const firstMax = (r: typeof base) => r.events.find((e) => e.kind === 'cpp-max')!.periodIndex;
    expect(firstMax(withRsu)).toBeLessThan(firstMax(base));
    expect(withRsu.totals.cpp).toBe(4230.45);
  });

  it('withholds a flat rate on RSUs when requested', () => {
    const r = simulatePayroll(
      payrollInput({
        lumpSums: [{ id: 'a', type: 'rsu', date: '2026-03-01', amount: 10_000 }],
        rsuWithholding: { method: 'flat', flatRate: 0.5 },
      }),
      cfg,
    );
    expect(r.totals.rsuFlatTax).toBe(5_000);
    expect(r.totals.rsuTaxWithheld).toBe(5_000);
  });

  it('treats taxable benefits as pensionable but not insurable', () => {
    const r = simulatePayroll(
      payrollInput({ annualSalary: 40_000, perPay: { ...noDeductions, taxableBenefits: 100 } }),
      cfg,
    );
    expect(r.totals.ei).toBeCloseTo(40_000 * 0.0163, 0);
    expect(r.totals.cpp).toBeCloseTo((42_600 - 3_500) * 0.0595, 0);
  });
});

describe('RSU analysis', () => {
  it('reports the incremental tax on RSU at the marginal rate', () => {
    const res = calculate(
      calcInput({
        annualSalary: 150_000,
        rsuVests: [{ id: 'a', date: '2026-05-15', amount: 20_000 }],
      }),
    );
    expect(res.rsu).not.toBeNull();
    // $150k–$170k sits in the 26% federal + 11.16%/12.16% Ontario brackets (~43.4%–44.97% combined).
    expect(res.rsu!.effectiveTaxRate).toBeGreaterThan(0.43);
    expect(res.rsu!.effectiveTaxRate).toBeLessThan(0.46);
    // Salary already exceeds every ceiling: no extra CPP/EI.
    expect(res.rsu!.incrementalPayroll).toBe(0);
  });

  it('converts USD vests with the FX rate', () => {
    const res = calculate(
      calcInput({
        rsuCurrency: 'USD',
        usdCad: 1.4,
        rsuVests: [{ id: 'a', date: '2026-05-15', amount: 10_000 }],
      }),
    );
    expect(res.rsu!.totalRsu).toBe(14_000);
  });
});

describe('retirement contributions', () => {
  const pct = (value: number) => ({ mode: 'percent' as const, value });

  it('converts a percentage of salary into dollars per paycheck', () => {
    const r = resolveRetirement({ ...noRetirement(), groupRrsp: pct(5) }, 120_000, 'biweekly');
    expect(r.perPay.groupRrsp).toBe(230.77);
    expect(r.annual.groupRrsp).toBeCloseTo(6_000, 0);
  });

  it('caps the employer match at a percentage of salary', () => {
    const r = resolveRetirement(
      { ...noRetirement(), groupRrsp: pct(6), match: { ...noRetirement().match, enabled: true, rate: 100, capPercent: 4 } },
      130_000,
      'biweekly',
    );
    expect(r.perPay.employerMatch).toBe(200); // 4% of $5,000
    const half = resolveRetirement(
      { ...noRetirement(), groupRrsp: pct(6), match: { ...noRetirement().match, enabled: true, rate: 50, capPercent: 0 } },
      130_000,
      'biweekly',
    );
    expect(half.perPay.employerMatch).toBe(150); // 50% of 6% of $5,000
  });

  it('charges CPP/EI but (almost) no income tax on a group RRSP match', () => {
    const base = calcInput({ annualSalary: 50_000, retirement: { ...noRetirement(), groupRrsp: pct(5) } });
    const matched = calcInput({
      annualSalary: 50_000,
      retirement: { ...noRetirement(), groupRrsp: pct(5), match: { ...noRetirement().match, enabled: true, rate: 100 } },
    });
    const a = calculate(base);
    const b = calculate(matched);
    expect(b.retirement.annual.employerMatch).toBeCloseTo(2_500, 0);
    expect(b.employmentIncome - a.employmentIncome).toBeCloseTo(2_500, 0);
    expect(b.annual.taxableIncome).toBeLessThan(a.annual.taxableIncome); // only the enhanced-CPP deduction moves
    expect(Math.abs(b.annual.totalIncomeTax - a.annual.totalIncomeTax)).toBeLessThan(50);
    expect(b.annual.cpp1 - a.annual.cpp1).toBeCloseTo(2_500 * 0.0595, 0);
    expect(b.annual.ei - a.annual.ei).toBeCloseTo(2_500 * 0.0163, 0);
    // The match is not cash.
    expect(b.payroll.totals.netCash).toBeLessThan(a.payroll.totals.netCash);
  });

  it('does not touch tax, CPP or EI when the match goes into a DPSP', () => {
    const base = calcInput({ annualSalary: 50_000, retirement: { ...noRetirement(), groupRrsp: pct(5) } });
    const dpsp = calcInput({
      annualSalary: 50_000,
      retirement: {
        ...noRetirement(),
        groupRrsp: pct(5),
        match: { ...noRetirement().match, enabled: true, rate: 100, plan: 'dpsp' },
      },
    });
    const a = calculate(base);
    const b = calculate(dpsp);
    expect(b.annual.totalIncomeTax).toBe(a.annual.totalIncomeTax);
    expect(b.annual.cpp1).toBe(a.annual.cpp1);
    expect(b.payroll.totals.netCash).toBe(a.payroll.totals.netCash);
    expect(b.retirement.annual.employerMatch).toBeCloseTo(2_500, 0);
  });

  it('reduces taxable income by employee RPP / RRSP contributions', () => {
    const a = calculate(calcInput({ annualSalary: 100_000 }));
    const b = calculate(calcInput({ annualSalary: 100_000, retirement: { ...noRetirement(), rpp: pct(5) } }));
    expect(a.annual.taxableIncome - b.annual.taxableIncome).toBeCloseTo(5_000, 0);
    expect(Math.abs(b.refund)).toBeLessThan(150);
  });
});
