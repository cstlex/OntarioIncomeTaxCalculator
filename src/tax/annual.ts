/**
 * Annual (tax-return) calculation for an Ontario resident employee.
 *
 * This is what you actually owe for the year (T1 + ON428), as opposed to what
 * payroll withholds paycheck by paycheck (see payroll.ts).
 */
import { contributionMaximums, round2, type Bracket, type TaxYearConfig } from './config';

export function bracketTax(income: number, brackets: Bracket[]): number {
  let tax = 0;
  let lower = 0;
  for (const { upTo, rate } of brackets) {
    if (income <= lower) break;
    tax += (Math.min(income, upTo) - lower) * rate;
    lower = upTo;
  }
  return tax;
}

/** Highest bracket rate that applies to the next dollar of `income`. */
export function bracketRate(income: number, brackets: Bracket[]): number {
  for (const { upTo, rate } of brackets) {
    if (income < upTo) return rate;
  }
  return brackets[brackets.length - 1].rate;
}

/** Federal basic personal amount, phased out between the 4th and 5th bracket thresholds. */
export function federalBpa(netIncome: number, config: TaxYearConfig): number {
  const { bpaMax, bpaMin, bpaPhaseOutStart, bpaPhaseOutEnd } = config.federal;
  if (netIncome <= bpaPhaseOutStart) return bpaMax;
  if (netIncome >= bpaPhaseOutEnd) return bpaMin;
  return (
    bpaMax - ((bpaMax - bpaMin) * (netIncome - bpaPhaseOutStart)) / (bpaPhaseOutEnd - bpaPhaseOutStart)
  );
}

export function ontarioHealthPremium(taxableIncome: number, config: TaxYearConfig): number {
  const tiers = config.ontario.healthPremium;
  let premium = 0;
  for (const tier of tiers) {
    if (taxableIncome > tier.from) {
      premium = Math.min(tier.cap, tier.base + tier.rate * (taxableIncome - tier.from));
    }
  }
  return premium;
}

export function ontarioSurtax(basicOntarioTax: number, config: TaxYearConfig): number {
  const { threshold1, rate1, threshold2, rate2 } = config.ontario.surtax;
  return (
    Math.max(0, basicOntarioTax - threshold1) * rate1 + Math.max(0, basicOntarioTax - threshold2) * rate2
  );
}

/** Ontario tax reduction (single, no dependants). */
export function ontarioTaxReduction(taxAfterSurtax: number, config: TaxYearConfig): number {
  const reduction = 2 * config.ontario.taxReductionBasic - taxAfterSurtax;
  return Math.max(0, Math.min(taxAfterSurtax, reduction));
}

export function annualCpp(pensionableEarnings: number, config: TaxYearConfig) {
  const { cpp } = config;
  const max = contributionMaximums(config);
  const cpp1 = Math.min(
    max.cppMax,
    Math.max(0, Math.min(pensionableEarnings, cpp.ympe) - cpp.basicExemption) * cpp.rate,
  );
  const cpp2 = Math.min(
    max.cpp2Max,
    Math.max(0, Math.min(pensionableEarnings, cpp.yampe) - cpp.ympe) * cpp.cpp2Rate,
  );
  return { cpp1: round2(cpp1), cpp2: round2(cpp2) };
}

export function annualEi(insurableEarnings: number, config: TaxYearConfig): number {
  const max = contributionMaximums(config);
  return round2(Math.min(max.eiMax, Math.min(insurableEarnings, config.ei.maxInsurableEarnings) * config.ei.rate));
}

export interface AnnualInput {
  /** Total employment income (T4 box 14): salary + bonuses + RSU vests + taxable benefits. */
  employmentIncome: number;
  /** CPP contributions actually paid (employee share). */
  cpp1: number;
  cpp2: number;
  ei: number;
  /** Deductions from total income: RPP, RRSP (payroll + personal), union dues, etc. */
  otherDeductions: number;
}

export interface AnnualResult {
  employmentIncome: number;
  enhancedCppDeduction: number;
  otherDeductions: number;
  netIncome: number;
  taxableIncome: number;
  federal: {
    bracketTax: number;
    bpa: number;
    credits: number;
    tax: number;
  };
  ontario: {
    bracketTax: number;
    credits: number;
    basicTax: number;
    surtax: number;
    taxReduction: number;
    lift: number;
    /** Ontario income tax excluding the health premium. */
    tax: number;
    healthPremium: number;
  };
  /** Federal + Ontario + Ontario Health Premium. */
  totalIncomeTax: number;
  cpp1: number;
  cpp2: number;
  ei: number;
}

/** Annual T1/ON428 computation for a single filer with employment income only. */
export function computeAnnualTax(input: AnnualInput, config: TaxYearConfig): AnnualResult {
  const { cpp } = config;
  const { employmentIncome, cpp1, cpp2, ei, otherDeductions } = input;

  // CPP enhanced contributions (first additional 1% of the 5.95% plus all of CPP2)
  // are a deduction from income; the base 4.95% portion is a credit.
  const cppEnhanced = cpp1 * ((cpp.rate - cpp.baseRate) / cpp.rate);
  const cppBase = cpp1 - cppEnhanced;
  const enhancedCppDeduction = cppEnhanced + cpp2;

  const netIncome = Math.max(0, employmentIncome - enhancedCppDeduction - otherDeductions);
  const taxableIncome = netIncome;

  // Federal
  const fedBracket = bracketTax(taxableIncome, config.federal.brackets);
  const bpa = federalBpa(netIncome, config);
  const cea = Math.min(config.federal.canadaEmploymentAmount, employmentIncome);
  const fedCredits = (bpa + cppBase + ei + cea) * config.federal.creditRate;
  const federalTax = Math.max(0, fedBracket - fedCredits);

  // Ontario
  const onBracket = bracketTax(taxableIncome, config.ontario.brackets);
  const onCredits = (config.ontario.bpa + cppBase + ei) * config.ontario.creditRate;
  const basicTax = Math.max(0, onBracket - onCredits);
  const surtax = ontarioSurtax(basicTax, config);
  const taxReduction = ontarioTaxReduction(basicTax + surtax, config);
  const afterReduction = basicTax + surtax - taxReduction;
  const { lift: liftCfg } = config.ontario;
  const liftEntitlement = Math.max(
    0,
    Math.min(liftCfg.max, employmentIncome * liftCfg.rate) -
      Math.max(0, netIncome - liftCfg.phaseOutStart) * liftCfg.phaseOutRate,
  );
  const lift = Math.min(afterReduction, liftEntitlement);
  const ontarioTax = afterReduction - lift;
  const healthPremium = ontarioHealthPremium(taxableIncome, config);

  return {
    employmentIncome: round2(employmentIncome),
    enhancedCppDeduction: round2(enhancedCppDeduction),
    otherDeductions: round2(otherDeductions),
    netIncome: round2(netIncome),
    taxableIncome: round2(taxableIncome),
    federal: {
      bracketTax: round2(fedBracket),
      bpa: round2(bpa),
      credits: round2(fedCredits),
      tax: round2(federalTax),
    },
    ontario: {
      bracketTax: round2(onBracket),
      credits: round2(onCredits),
      basicTax: round2(basicTax),
      surtax: round2(surtax),
      taxReduction: round2(taxReduction),
      lift: round2(lift),
      tax: round2(ontarioTax),
      healthPremium: round2(healthPremium),
    },
    totalIncomeTax: round2(federalTax + ontarioTax + healthPremium),
    cpp1,
    cpp2,
    ei,
  };
}

export interface SimpleAnnualInput {
  /** Pensionable & taxable employment income. */
  employmentIncome: number;
  /** Earnings subject to EI (e.g. excludes non-cash taxable benefits). */
  insurableEarnings: number;
  otherDeductions: number;
}

/** Annual calculation that derives CPP/EI from earnings (what the return settles to). */
export function computeAnnualFromEarnings(input: SimpleAnnualInput, config: TaxYearConfig) {
  const { cpp1, cpp2 } = annualCpp(input.employmentIncome, config);
  const ei = annualEi(input.insurableEarnings, config);
  return computeAnnualTax(
    { employmentIncome: input.employmentIncome, cpp1, cpp2, ei, otherDeductions: input.otherDeductions },
    config,
  );
}

/**
 * Marginal rate on the next `step` dollars of employment income.
 * Returns both the income-tax-only rate and the rate including CPP/EI.
 */
export function marginalRates(input: SimpleAnnualInput, config: TaxYearConfig, step = 100) {
  const base = computeAnnualFromEarnings(input, config);
  const next = computeAnnualFromEarnings(
    {
      ...input,
      employmentIncome: input.employmentIncome + step,
      insurableEarnings: input.insurableEarnings + step,
    },
    config,
  );
  const taxDelta = next.totalIncomeTax - base.totalIncomeTax;
  const payrollDelta = next.cpp1 + next.cpp2 + next.ei - (base.cpp1 + base.cpp2 + base.ei);
  return {
    incomeTax: taxDelta / step,
    withPayroll: (taxDelta + payrollDelta) / step,
  };
}
