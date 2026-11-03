/**
 * Paycheck-by-paycheck payroll simulation for an Ontario employee, following the
 * CRA "Payroll Deductions Formulas" (T4127) method:
 *
 * - CPP: 5.95% of pensionable earnings above the per-period share of the $3,500
 *   basic exemption, until the annual maximum is reached.
 * - CPP2: 4% of pensionable earnings between YMPE and YAMPE, which only starts
 *   once year-to-date pensionable earnings pass the YMPE.
 * - EI: 1.63% of insurable earnings until the maximum insurable earnings.
 * - Income tax: the period's income is annualized (× pay periods), taxed with the
 *   annual formula, then divided back. Non-periodic payments (bonuses, RSU vests)
 *   use the CRA bonus method (tax on income with the payment minus tax without).
 *
 * Because contributions stop once a maximum is hit, net pay changes during the year.
 */
import { contributionMaximums, round2, type TaxYearConfig } from './config';
import {
  bracketTax,
  federalBpa,
  ontarioHealthPremium,
  ontarioSurtax,
  ontarioTaxReduction,
} from './annual';

export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

export const PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

export interface LumpSum {
  id: string;
  type: 'rsu' | 'bonus';
  /** ISO date (YYYY-MM-DD). Paid on the first paycheck on or after this date. */
  date: string;
  /** Amount in CAD. */
  amount: number;
}

export interface PerPayDeductions {
  /** Registered pension plan contribution (pre-tax). */
  rpp: number;
  /** Group RRSP contribution through payroll (pre-tax). */
  groupRrsp: number;
  /** Union / professional dues (pre-tax). */
  unionDues: number;
  /** Non-cash taxable benefits, e.g. employer-paid life insurance (taxable + pensionable, not insurable). */
  taxableBenefits: number;
  /** After-tax deductions: benefit premiums, ESPP, charity, parking, etc. */
  postTax: number;
  /**
   * Employer contribution to your group RRSP. A taxable benefit (pensionable; insurable unless
   * withdrawals are restricted) that is offset by the matching RRSP deduction, so income tax is
   * unchanged but CPP (and usually EI) is charged on it. Employer DPSP / RPP contributions are
   * not taxable and should not be entered here.
   */
  employerRrsp?: number;
  /** Whether the employer group-RRSP contribution is insurable earnings (default true). */
  employerRrspInsurable?: boolean;
}

export interface PayrollInput {
  annualSalary: number;
  frequency: PayFrequency;
  /** First pay date for weekly / bi-weekly schedules (ISO date). */
  firstPayDate: string;
  perPay: PerPayDeductions;
  lumpSums: LumpSum[];
  rsuWithholding: { method: 'bonus' | 'flat'; flatRate: number };
  /** Whether RSU vests are insurable earnings (subject to EI). */
  rsuSubjectToEi: boolean;
  /** If true, CPP/EI caused by an RSU vest is covered by shares sold, not the cash paycheck. */
  rsuCppEiFromShares: boolean;
}

export interface TaxSplit {
  federal: number;
  ontario: number;
  healthPremium: number;
}

export interface PayPeriod {
  index: number;
  date: string;
  regularGross: number;
  bonus: number;
  rsu: number;
  taxableBenefits: number;
  /** Employer group-RRSP contribution (non-cash taxable benefit). */
  employerRrsp: number;
  cpp: number;
  cpp2: number;
  ei: number;
  /** Income tax withheld, by component (regular pay + bonus + RSU when using the bonus method). */
  tax: TaxSplit;
  /** Flat-rate withholding on RSU (only with the flat method). */
  rsuFlatTax: number;
  /** Total income tax withheld this period. */
  totalTax: number;
  /** Portion of income tax withheld from the RSU shares (sell-to-cover). */
  rsuTaxWithheld: number;
  /** CPP/EI charged to the RSU shares (when `rsuCppEiFromShares`). */
  rsuPayrollFromShares: number;
  preTaxDeductions: number;
  postTaxDeductions: number;
  /** Cash deposited to the bank account. */
  netCash: number;
  /** RSU value left after withholding. */
  rsuNet: number;
  ytd: { pensionable: number; insurable: number; cpp: number; cpp2: number; ei: number };
  /** Events that happen on this paycheck. */
  events: PayrollEvent[];
}

export type PayrollEventKind = 'ei-max' | 'cpp-max' | 'cpp2-start' | 'cpp2-max';

export interface PayrollEvent {
  kind: PayrollEventKind;
  periodIndex: number;
  date: string;
}

export interface PayrollResult {
  periods: PayPeriod[];
  periodsPerYear: number;
  events: PayrollEvent[];
  totals: {
    regularGross: number;
    bonus: number;
    rsu: number;
    taxableBenefits: number;
    employerRrsp: number;
    cpp: number;
    cpp2: number;
    ei: number;
    tax: TaxSplit;
    rsuFlatTax: number;
    totalTax: number;
    rsuTaxWithheld: number;
    preTaxDeductions: number;
    postTaxDeductions: number;
    netCash: number;
    rsuNet: number;
    rpp: number;
    groupRrsp: number;
    unionDues: number;
  };
}

// ---------------------------------------------------------------------------
// Pay dates
// ---------------------------------------------------------------------------

function parseIso(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function lastDayOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month + 1, 0));
}

export function payDates(frequency: PayFrequency, year: number, firstPayDate: string): string[] {
  const n = PERIODS_PER_YEAR[frequency];
  const dates: string[] = [];
  if (frequency === 'monthly') {
    for (let m = 0; m < 12; m++) dates.push(toIso(lastDayOfMonth(year, m)));
  } else if (frequency === 'semimonthly') {
    for (let m = 0; m < 12; m++) {
      dates.push(toIso(new Date(Date.UTC(year, m, 15))));
      dates.push(toIso(lastDayOfMonth(year, m)));
    }
  } else {
    const step = frequency === 'weekly' ? 7 : 14;
    let start = parseIso(firstPayDate);
    if (Number.isNaN(start.getTime()) || start.getUTCFullYear() !== year) {
      start = new Date(Date.UTC(year, 0, 1));
    }
    for (let i = 0; i < n; i++) {
      dates.push(toIso(new Date(start.getTime() + i * step * 86_400_000)));
    }
  }
  return dates;
}

/** Index of the first pay date on or after `date` (clamped to the last paycheck). */
export function periodForDate(dates: string[], date: string): number {
  const idx = dates.findIndex((d) => d >= date);
  return idx === -1 ? dates.length - 1 : idx;
}

// ---------------------------------------------------------------------------
// Annualized withholding tax (T4127 chapter 6, Ontario)
// ---------------------------------------------------------------------------

interface CreditBase {
  /** Annual base-CPP amount used for the K2 / K2P credits. */
  cppBase: number;
  /** Annual EI amount used for the K2 / K2P credits. */
  ei: number;
}

/** Annual tax T1 (federal) and T2 (Ontario, incl. health premium) on annualized income A. */
export function annualizedWithholding(A: number, credits: CreditBase, config: TaxYearConfig): TaxSplit {
  if (A <= 0) return { federal: 0, ontario: 0, healthPremium: 0 };
  const fed = config.federal;
  const K1 = fed.creditRate * federalBpa(A, config);
  const K2 = fed.creditRate * (credits.cppBase + credits.ei);
  const K4 = Math.min(fed.creditRate * A, fed.creditRate * fed.canadaEmploymentAmount);
  const T3 = Math.max(0, bracketTax(A, fed.brackets) - K1 - K2 - K4);

  const on = config.ontario;
  const K1P = on.creditRate * on.bpa;
  const K2P = on.creditRate * (credits.cppBase + credits.ei);
  const T4 = Math.max(0, bracketTax(A, on.brackets) - K1P - K2P);
  const V1 = ontarioSurtax(T4, config);
  const S = ontarioTaxReduction(T4 + V1, config);
  const V2 = ontarioHealthPremium(A, config);

  return { federal: T3, ontario: T4 + V1 - S, healthPremium: V2 };
}

function splitDiff(a: TaxSplit, b: TaxSplit): TaxSplit {
  return {
    federal: Math.max(0, a.federal - b.federal),
    ontario: Math.max(0, a.ontario - b.ontario),
    healthPremium: Math.max(0, a.healthPremium - b.healthPremium),
  };
}

function splitScale(a: TaxSplit, factor: number): TaxSplit {
  return { federal: a.federal * factor, ontario: a.ontario * factor, healthPremium: a.healthPremium * factor };
}

function splitAdd(a: TaxSplit, b: TaxSplit): TaxSplit {
  return {
    federal: a.federal + b.federal,
    ontario: a.ontario + b.ontario,
    healthPremium: a.healthPremium + b.healthPremium,
  };
}

function splitRound(a: TaxSplit): TaxSplit {
  return { federal: round2(a.federal), ontario: round2(a.ontario), healthPremium: round2(a.healthPremium) };
}

function splitTotal(a: TaxSplit): number {
  return a.federal + a.ontario + a.healthPremium;
}

const ZERO_SPLIT: TaxSplit = { federal: 0, ontario: 0, healthPremium: 0 };

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

export function simulatePayroll(input: PayrollInput, config: TaxYearConfig): PayrollResult {
  const P = PERIODS_PER_YEAR[input.frequency];
  const dates = payDates(input.frequency, config.year, input.firstPayDate);
  const max = contributionMaximums(config);
  const { cpp: cppCfg, ei: eiCfg } = config;
  const exemptionPerPeriod = cppCfg.basicExemption / P;
  const salary = Math.max(0, input.annualSalary);
  // Spread the cents so the paychecks add up to exactly the annual salary.
  const regularFor = (i: number) => round2(round2((salary * (i + 1)) / P) - round2((salary * i) / P));
  const regularGross = round2(salary / P);
  const pp = input.perPay;
  const preTax = Math.max(0, pp.rpp) + Math.max(0, pp.groupRrsp) + Math.max(0, pp.unionDues);
  const benefits = Math.max(0, pp.taxableBenefits);
  const postTax = Math.max(0, pp.postTax);
  const employerRrsp = Math.max(0, pp.employerRrsp ?? 0);
  const employerRrspInsurable = pp.employerRrspInsurable ?? true;
  const employerInsurable = employerRrspInsurable ? employerRrsp : 0;

  // Group lump sums by paycheck.
  const lumpsByPeriod = new Map<number, { bonus: number; rsu: number }>();
  for (const lump of input.lumpSums) {
    if (!(lump.amount > 0) || !lump.date) continue;
    const idx = periodForDate(dates, lump.date);
    const entry = lumpsByPeriod.get(idx) ?? { bonus: 0, rsu: 0 };
    entry[lump.type] += lump.amount;
    lumpsByPeriod.set(idx, entry);
  }

  // Regular-pay contribution estimates used for the K2/K2P credits (T4127 annualizes
  // the period's contribution; once a maximum is reached the maximum is used).
  const regularPensionable = regularGross + benefits + employerRrsp;
  const cppBaseEstimate = Math.min(
    max.cppBaseMax,
    P * Math.max(0, regularPensionable - exemptionPerPeriod) * cppCfg.baseRate,
  );
  const eiEstimate = Math.min(max.eiMax, P * (regularGross + employerInsurable) * eiCfg.rate);

  const ytd = { pensionable: 0, insurable: 0, cpp: 0, cpp2: 0, ei: 0, lumpNet: 0 };
  const periods: PayPeriod[] = [];
  const events: PayrollEvent[] = [];

  for (let i = 0; i < P; i++) {
    const regularGross = regularFor(i);
    const lumps = lumpsByPeriod.get(i) ?? { bonus: 0, rsu: 0 };
    const bonus = round2(lumps.bonus);
    const rsu = round2(lumps.rsu);
    const pensionable = regularGross + benefits + employerRrsp + bonus + rsu;
    const insurable = regularGross + employerInsurable + bonus + (input.rsuSubjectToEi ? rsu : 0);
    const periodEvents: PayrollEvent[] = [];
    const date = dates[i];

    // --- CPP (first ceiling) ---
    const cppRoom = Math.max(0, max.cppMax - ytd.cpp);
    const cpp = round2(Math.min(cppRoom, Math.max(0, pensionable - exemptionPerPeriod) * cppCfg.rate));

    // --- CPP2 (second ceiling) ---
    const peBefore = ytd.pensionable;
    const peAfter = ytd.pensionable + pensionable;
    const cpp2Earnings = Math.max(0, Math.min(peAfter, cppCfg.yampe) - Math.max(peBefore, cppCfg.ympe));
    const cpp2Room = Math.max(0, max.cpp2Max - ytd.cpp2);
    // Once YTD earnings pass the YAMPE, take whatever room is left so rounding
    // of earlier periods cannot leave a few cents unpaid.
    const cpp2 = peAfter >= cppCfg.yampe ? round2(cpp2Room) : round2(Math.min(cpp2Room, cpp2Earnings * cppCfg.cpp2Rate));

    // --- EI ---
    const eiRoom = Math.max(0, max.eiMax - ytd.ei);
    const insurableRoom = Math.max(0, eiCfg.maxInsurableEarnings - ytd.insurable);
    const ei = round2(Math.min(eiRoom, round2(insurable * eiCfg.rate)));

    const ytdCppAfter = round2(ytd.cpp + cpp);
    const ytdCpp2After = round2(ytd.cpp2 + cpp2);
    const ytdEiAfter = round2(ytd.ei + ei);

    if (ytd.ei < max.eiMax && ytdEiAfter >= max.eiMax) periodEvents.push({ kind: 'ei-max', periodIndex: i, date });
    if (ytd.cpp < max.cppMax && ytdCppAfter >= max.cppMax) periodEvents.push({ kind: 'cpp-max', periodIndex: i, date });
    if (ytd.cpp2 === 0 && cpp2 > 0) periodEvents.push({ kind: 'cpp2-start', periodIndex: i, date });
    if (ytd.cpp2 < max.cpp2Max && ytdCpp2After >= max.cpp2Max) periodEvents.push({ kind: 'cpp2-max', periodIndex: i, date });

    // --- Income tax ---
    // Enhanced CPP (F5) reduces income for withholding; split between the regular
    // part (F5A) and the non-periodic part (F5B) in proportion to earnings.
    const F5 = cpp * ((cppCfg.rate - cppCfg.baseRate) / cppCfg.rate) + cpp2;
    const lumpTotal = bonus + rsu;
    const F5B = pensionable > 0 ? F5 * (lumpTotal / pensionable) : 0;
    const F5A = F5 - F5B;

    const credits: CreditBase = {
      cppBase: ytdCppAfter >= max.cppMax ? max.cppBaseMax : cppBaseEstimate,
      ei: ytdEiAfter >= max.eiMax ? max.eiMax : eiEstimate,
    };

    // The employer RRSP contribution is income (I) and an RRSP deduction (F) at the same time.
    const A = Math.max(0, P * (regularGross + benefits + employerRrsp - preTax - employerRrsp - F5A));
    const regularAnnual = annualizedWithholding(A, credits, config);
    const regularTax = splitScale(regularAnnual, 1 / P);

    // Non-periodic payments: bonus method on the cash bonus (and RSU unless flat).
    const flat = input.rsuWithholding.method === 'flat';
    const bonusMethodAmount = bonus + (flat ? 0 : rsu);
    let lumpTax: TaxSplit = ZERO_SPLIT;
    if (bonusMethodAmount > 0) {
      const share = lumpTotal > 0 ? bonusMethodAmount / lumpTotal : 0;
      const netLump = bonusMethodAmount - F5B * share;
      const withLump = annualizedWithholding(A + ytd.lumpNet + netLump, credits, config);
      const withoutLump = annualizedWithholding(A + ytd.lumpNet, credits, config);
      lumpTax = splitDiff(withLump, withoutLump);
      ytd.lumpNet += netLump;
    }
    if (flat && rsu > 0) {
      ytd.lumpNet += rsu - F5B * (rsu / lumpTotal);
    }
    const rsuFlatTax = flat ? round2(rsu * Math.max(0, input.rsuWithholding.flatRate)) : 0;

    const tax = splitRound(splitAdd(regularTax, lumpTax));
    const totalTax = round2(splitTotal(tax) + rsuFlatTax);

    // RSU share of the tax (sell-to-cover).
    const rsuTaxFromBonusMethod = !flat && bonusMethodAmount > 0 ? splitTotal(lumpTax) * (rsu / bonusMethodAmount) : 0;
    const rsuTaxWithheld = round2(Math.min(rsu, rsuTaxFromBonusMethod + rsuFlatTax));

    // RSU share of CPP/EI (optional sell-to-cover).
    let rsuPayrollFromShares = 0;
    if (input.rsuCppEiFromShares && rsu > 0) {
      const cppShare = pensionable > 0 ? rsu / pensionable : 0;
      const eiShare = input.rsuSubjectToEi && insurable > 0 ? rsu / insurable : 0;
      rsuPayrollFromShares = round2(
        Math.min(rsu - rsuTaxWithheld, (cpp + cpp2) * cppShare + ei * eiShare),
      );
    }

    const cashGross = regularGross + bonus;
    const netCash = round2(
      cashGross - preTax - postTax - (cpp + cpp2 + ei - rsuPayrollFromShares) - (totalTax - rsuTaxWithheld),
    );
    const rsuNet = round2(rsu - rsuTaxWithheld - rsuPayrollFromShares);

    ytd.pensionable = peAfter;
    ytd.insurable += Math.min(insurable, insurableRoom);
    ytd.cpp = ytdCppAfter;
    ytd.cpp2 = ytdCpp2After;
    ytd.ei = ytdEiAfter;

    events.push(...periodEvents);
    periods.push({
      index: i,
      date,
      regularGross,
      bonus,
      rsu,
      taxableBenefits: benefits,
      employerRrsp,
      cpp,
      cpp2,
      ei,
      tax,
      rsuFlatTax,
      totalTax,
      rsuTaxWithheld,
      rsuPayrollFromShares,
      preTaxDeductions: round2(preTax),
      postTaxDeductions: round2(postTax),
      netCash,
      rsuNet,
      ytd: {
        pensionable: round2(ytd.pensionable),
        insurable: round2(ytd.insurable),
        cpp: ytd.cpp,
        cpp2: ytd.cpp2,
        ei: ytd.ei,
      },
      events: periodEvents,
    });
  }

  const sum = (fn: (p: PayPeriod) => number) => round2(periods.reduce((acc, p) => acc + fn(p), 0));
  return {
    periods,
    periodsPerYear: P,
    events,
    totals: {
      regularGross: sum((p) => p.regularGross),
      bonus: sum((p) => p.bonus),
      rsu: sum((p) => p.rsu),
      taxableBenefits: sum((p) => p.taxableBenefits),
      employerRrsp: sum((p) => p.employerRrsp),
      cpp: sum((p) => p.cpp),
      cpp2: sum((p) => p.cpp2),
      ei: sum((p) => p.ei),
      tax: {
        federal: sum((p) => p.tax.federal),
        ontario: sum((p) => p.tax.ontario),
        healthPremium: sum((p) => p.tax.healthPremium),
      },
      rsuFlatTax: sum((p) => p.rsuFlatTax),
      totalTax: sum((p) => p.totalTax),
      rsuTaxWithheld: sum((p) => p.rsuTaxWithheld),
      preTaxDeductions: sum((p) => p.preTaxDeductions),
      postTaxDeductions: sum((p) => p.postTaxDeductions),
      netCash: sum((p) => p.netCash),
      rsuNet: sum((p) => p.rsuNet),
      rpp: round2(Math.max(0, pp.rpp) * P),
      groupRrsp: round2(Math.max(0, pp.groupRrsp) * P),
      unionDues: round2(Math.max(0, pp.unionDues) * P),
    },
  };
}
