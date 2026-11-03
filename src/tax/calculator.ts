/**
 * Glue between the payroll simulation and the annual return: produces everything
 * the UI shows (annual summary, refund/balance owing, RSU analysis, paycheck phases).
 */
import { getTaxYear, round2 } from './config';
import { computeAnnualTax, marginalRates, type AnnualResult } from './annual';
import {
  simulatePayroll,
  type LumpSum,
  type PayFrequency,
  type PayPeriod,
  type PayrollEvent,
  type PayrollResult,
  type PerPayDeductions,
} from './payroll';

export interface CalculatorInput {
  year: number;
  annualSalary: number;
  frequency: PayFrequency;
  firstPayDate: string;
  perPay: PerPayDeductions;
  /** RRSP contributions made outside payroll (deducted on the return only). */
  personalRrsp: number;
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
  deductions: { rpp: number; groupRrsp: number; unionDues: number; personalRrsp: number; total: number };
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
  const payroll = simulatePayroll(
    {
      annualSalary: input.annualSalary,
      frequency: input.frequency,
      firstPayDate: input.firstPayDate,
      perPay: input.perPay,
      lumpSums: toLumps(input, includeRsu),
      rsuWithholding: input.rsuWithholding,
      rsuSubjectToEi: input.rsuSubjectToEi,
      rsuCppEiFromShares: input.rsuCppEiFromShares,
    },
    config,
  );
  const t = payroll.totals;
  const employmentIncome = round2(t.regularGross + t.bonus + t.rsu + t.taxableBenefits);
  const insurableEarnings = round2(t.regularGross + t.bonus + (input.rsuSubjectToEi ? t.rsu : 0));
  const personalRrsp = Math.max(0, input.personalRrsp);
  const deductionsTotal = round2(t.rpp + t.groupRrsp + t.unionDues + personalRrsp);
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
      unionDues: t.unionDues,
      personalRrsp,
      total: deductionsTotal,
    },
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
  const { config, payroll, annual, employmentIncome, insurableEarnings, deductions } = main;
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
    refund,
    averageRate: gross > 0 ? (annual.totalIncomeTax + payrollTotal) / gross : 0,
    averageTaxRate: gross > 0 ? annual.totalIncomeTax / gross : 0,
    marginal,
    netAfterReturn: round2(t.netCash + t.rsuNet + refund),
    phases: buildPhases(payroll),
    rsu,
  };
}
