/**
 * Glue between the payroll simulation and the annual return: produces everything
 * the UI shows (annual summary, refund/balance owing, RSU analysis, paycheck phases).
 */
import { getTaxYear, round2 } from './config';
import { computeAnnualTax, marginalRates, type AnnualResult } from './annual';
import {
  PERIODS_PER_YEAR,
  simulatePayroll,
  type LumpSum,
  type PayFrequency,
  type PayPeriod,
  type PayrollEvent,
  type PayrollResult,
} from './payroll';

/** A per-paycheck contribution entered either in dollars or as a % of base salary. */
export interface ContributionSetting {
  mode: 'amount' | 'percent';
  /** Dollars per paycheck, or percent of base salary (5 = 5%). */
  value: number;
}

export interface RetirementInput {
  /** Registered pension plan (pre-tax). */
  rpp: ContributionSetting;
  /** Your group RRSP contribution through payroll (pre-tax). */
  groupRrsp: ContributionSetting;
  /** Employer match on your group RRSP contribution. */
  match: {
    enabled: boolean;
    /** Percent of your group RRSP contribution the employer adds (100 = dollar for dollar). */
    rate: number;
    /** Maximum employer contribution as a percent of base salary (0 = no limit). */
    capPercent: number;
    /**
     * Where the employer money goes. Group RRSP: taxable benefit + RRSP deduction (CPP/EI apply).
     * DPSP: not taxable and no CPP/EI.
     */
    plan: 'rrsp' | 'dpsp';
    /** Group RRSP match is insurable unless withdrawals are restricted until retirement/termination. */
    insurable: boolean;
  };
  /** RRSP contributions made outside payroll (deducted on the return only). */
  personalRrsp: number;
}

export interface OtherPerPay {
  /** Union / professional dues (pre-tax). */
  unionDues: number;
  /** Non-cash taxable benefits (taxable + pensionable, not insurable). */
  taxableBenefits: number;
  /** After-tax deductions. */
  postTax: number;
}

export interface ResolvedRetirement {
  perPay: { rpp: number; groupRrsp: number; employerMatch: number };
  annual: { rpp: number; groupRrsp: number; employerMatch: number; personalRrsp: number; total: number };
  plan: 'rrsp' | 'dpsp';
}

/** Converts % settings into dollars per paycheck and applies the employer match formula. */
export function resolveRetirement(
  retirement: RetirementInput,
  annualSalary: number,
  frequency: PayFrequency,
): ResolvedRetirement {
  const P = PERIODS_PER_YEAR[frequency];
  const base = Math.max(0, annualSalary) / P;
  const amount = (c: ContributionSetting) =>
    round2(Math.max(0, c.mode === 'percent' ? (base * c.value) / 100 : c.value));
  const rpp = amount(retirement.rpp);
  const groupRrsp = amount(retirement.groupRrsp);
  const m = retirement.match;
  let employerMatch = 0;
  if (m.enabled) {
    const matched = (groupRrsp * Math.max(0, m.rate)) / 100;
    const cap = m.capPercent > 0 ? (base * m.capPercent) / 100 : Infinity;
    employerMatch = round2(Math.min(matched, cap));
  }
  const personalRrsp = Math.max(0, retirement.personalRrsp);
  const annual = {
    rpp: round2(rpp * P),
    groupRrsp: round2(groupRrsp * P),
    employerMatch: round2(employerMatch * P),
    personalRrsp,
  };
  return {
    perPay: { rpp, groupRrsp, employerMatch },
    annual: {
      ...annual,
      total: round2(annual.rpp + annual.groupRrsp + annual.employerMatch + annual.personalRrsp),
    },
    plan: m.plan,
  };
}

export interface CalculatorInput {
  year: number;
  annualSalary: number;
  frequency: PayFrequency;
  firstPayDate: string;
  perPay: OtherPerPay;
  retirement: RetirementInput;
  bonuses: Omit<LumpSum, 'type'>[];
  rsuVests: Omit<LumpSum, 'type'>[];
  /** Currency RSU vest values are entered in. */
  rsuCurrency: 'CAD' | 'USD';
  /** CAD per 1 USD, used when `rsuCurrency` is USD. */
  usdCad: number;
  rsuWithholding: { method: 'bonus' | 'flat'; flatRate: number };
  rsuSubjectToEi: boolean;
  rsuCppEiFromShares: boolean;
}

export interface PayPhase {
  /** First and last paycheck index (inclusive) of the phase. */
  start: number;
  end: number;
  startDate: string;
  endDate: string;
  /** Which contributions are still being deducted in this phase. */
  deducting: { cpp: boolean; cpp2: boolean; ei: boolean };
  /** A regular (no bonus / RSU) paycheck that represents the phase. */
  sample: PayPeriod;
  /** The event(s) that ended the previous phase. */
  trigger: PayrollEvent[];
}

export interface RsuAnalysis {
  totalRsu: number;
  /** Extra income tax caused by the RSU vests (annual return basis). */
  incrementalTax: number;
  /** Extra CPP + CPP2 + EI caused by the RSU vests. */
  incrementalPayroll: number;
  /** incrementalTax / totalRsu. */
  effectiveTaxRate: number;
  /** (incrementalTax + incrementalPayroll) / totalRsu. */
  effectiveTotalRate: number;
  /** Marginal rate on the last RSU dollar. */
  marginalTaxRate: number;
  /** Income tax actually withheld on the vests. */
  withheld: number;
  /** incrementalTax − withheld: positive means RSU withholding is short. */
  shortfall: number;
}

export interface CalculatorResult {
  payroll: PayrollResult;
  annual: AnnualResult;
  employmentIncome: number;
  insurableEarnings: number;
  deductions: {
    rpp: number;
    groupRrsp: number;
    /** Employer group-RRSP contributions (included in income, then deducted). */
    employerRrsp: number;
    unionDues: number;
    personalRrsp: number;
    total: number;
  };
  retirement: ResolvedRetirement;
  /** Withheld − owed: positive = refund, negative = balance owing. */
  refund: number;
  /** Total of income tax + CPP + EI over gross income. */
  averageRate: number;
  averageTaxRate: number;
  marginal: { incomeTax: number; withPayroll: number };
  /** Annual take-home: cash net + RSU value after withholding, adjusted for the refund. */
  netAfterReturn: number;
  phases: PayPhase[];
  rsu: RsuAnalysis | null;
}

function toLumps(input: CalculatorInput, includeRsu: boolean): LumpSum[] {
  const fx = input.rsuCurrency === 'USD' ? input.usdCad : 1;
  const bonuses = input.bonuses.map((b) => ({ ...b, type: 'bonus' as const }));
  const rsus = includeRsu
    ? input.rsuVests.map((v) => ({ ...v, type: 'rsu' as const, amount: round2(v.amount * fx) }))
    : [];
  return [...bonuses, ...rsus];
}

function run(input: CalculatorInput, includeRsu: boolean) {
  const config = getTaxYear(input.year);
  const retirement = resolveRetirement(input.retirement, input.annualSalary, input.frequency);
  const employerRrsp = retirement.plan === 'rrsp' ? retirement.perPay.employerMatch : 0;
  const payroll = simulatePayroll(
    {
      annualSalary: input.annualSalary,
      frequency: input.frequency,
      firstPayDate: input.firstPayDate,
      perPay: {
        ...input.perPay,
        rpp: retirement.perPay.rpp,
        groupRrsp: retirement.perPay.groupRrsp,
        employerRrsp,
        employerRrspInsurable: input.retirement.match.insurable,
      },
      lumpSums: toLumps(input, includeRsu),
      rsuWithholding: input.rsuWithholding,
      rsuSubjectToEi: input.rsuSubjectToEi,
      rsuCppEiFromShares: input.rsuCppEiFromShares,
    },
    config,
  );
  const t = payroll.totals;
  const employmentIncome = round2(t.regularGross + t.bonus + t.rsu + t.taxableBenefits + t.employerRrsp);
  const insurableEarnings = round2(
    t.regularGross +
      t.bonus +
      (input.rsuSubjectToEi ? t.rsu : 0) +
      (input.retirement.match.insurable ? t.employerRrsp : 0),
  );
  const personalRrsp = retirement.annual.personalRrsp;
  const deductionsTotal = round2(t.rpp + t.groupRrsp + t.employerRrsp + t.unionDues + personalRrsp);
  const annual = computeAnnualTax(
    { employmentIncome, cpp1: t.cpp, cpp2: t.cpp2, ei: t.ei, otherDeductions: deductionsTotal },
    config,
  );
  return {
    config,
    payroll,
    annual,
    employmentIncome,
    insurableEarnings,
    deductions: {
      rpp: t.rpp,
      groupRrsp: t.groupRrsp,
      employerRrsp: t.employerRrsp,
      unionDues: t.unionDues,
      personalRrsp,
      total: deductionsTotal,
    },
    retirement,
  };
}

export function buildPhases(payroll: PayrollResult): PayPhase[] {
  const { periods, events } = payroll;
  if (periods.length === 0) return [];
  // Phase boundaries: the paycheck after each "maximum reached" event.
  const maxEvents = events.filter((e) => e.kind !== 'cpp2-start');
  const boundaries = [...new Set(maxEvents.map((e) => e.periodIndex + 1))]
    .filter((b) => b < periods.length)
    .sort((a, b) => a - b);
  const starts = [0, ...boundaries];
  return starts.map((start, i) => {
    const end = (starts[i + 1] ?? periods.length) - 1;
    const slice = periods.slice(start, end + 1);
    // Prefer a regular paycheck that is not the one where a maximum is hit.
    const sample =
      slice.find((p) => p.bonus === 0 && p.rsu === 0 && !p.events.some((e) => e.kind !== 'cpp2-start')) ??
      slice.find((p) => p.bonus === 0 && p.rsu === 0) ??
      slice[0];
    const before = periods[start - 1];
    return {
      start,
      end,
      startDate: periods[start].date,
      endDate: periods[end].date,
      deducting: {
        cpp: sample.cpp > 0,
        cpp2: sample.cpp2 > 0,
        ei: sample.ei > 0,
      },
      sample,
      trigger: before ? before.events.filter((e) => e.kind !== 'cpp2-start') : [],
    };
  });
}

export function calculate(input: CalculatorInput): CalculatorResult {
  const main = run(input, true);
  const { config, payroll, annual, employmentIncome, insurableEarnings, deductions, retirement } = main;
  const t = payroll.totals;

  const refund = round2(t.totalTax - annual.totalIncomeTax);
  const payrollTotal = annual.cpp1 + annual.cpp2 + annual.ei;
  const marginal = marginalRates(
    {
      employmentIncome,
      insurableEarnings,
      otherDeductions: deductions.total,
    },
    config,
  );

  let rsu: RsuAnalysis | null = null;
  if (t.rsu > 0) {
    const without = run(input, false);
    const incrementalTax = round2(annual.totalIncomeTax - without.annual.totalIncomeTax);
    const incrementalPayroll = round2(
      payrollTotal - (without.annual.cpp1 + without.annual.cpp2 + without.annual.ei),
    );
    rsu = {
      totalRsu: t.rsu,
      incrementalTax,
      incrementalPayroll,
      effectiveTaxRate: incrementalTax / t.rsu,
      effectiveTotalRate: (incrementalTax + incrementalPayroll) / t.rsu,
      marginalTaxRate: marginal.incomeTax,
      withheld: t.rsuTaxWithheld,
      shortfall: round2(incrementalTax - t.rsuTaxWithheld),
    };
  }

  const gross = employmentIncome;
  return {
    payroll,
    annual,
    employmentIncome,
    insurableEarnings,
    deductions,
    retirement,
    refund,
    averageRate: gross > 0 ? (annual.totalIncomeTax + payrollTotal) / gross : 0,
    averageTaxRate: gross > 0 ? annual.totalIncomeTax / gross : 0,
    marginal,
    netAfterReturn: round2(t.netCash + t.rsuNet + refund),
    phases: buildPhases(payroll),
    rsu,
  };
}
