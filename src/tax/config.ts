/**
 * Tax-year parameters.
 *
 * Every number used by the engine lives here, so supporting a new year means
 * adding one object to `TAX_YEARS` (and a test). Sources for each value are
 * listed in AGENTS.md ("Tax data sources").
 */

export interface Bracket {
  /** Upper bound of the bracket (exclusive). `Infinity` for the top bracket. */
  upTo: number;
  rate: number;
}

export interface HealthPremiumTier {
  /** Tier applies to taxable income strictly above `from`. */
  from: number;
  /** Premium already reached at the start of the tier. */
  base: number;
  /** Phase-in rate applied to income above `from`. */
  rate: number;
  /** Maximum premium inside this tier. */
  cap: number;
}

export interface TaxYearConfig {
  year: number;
  federal: {
    brackets: Bracket[];
    /** Rate applied to non-refundable credits (lowest bracket rate). */
    creditRate: number;
    /** Enhanced basic personal amount (BPA) and its phase-out range. */
    bpaMax: number;
    bpaMin: number;
    bpaPhaseOutStart: number;
    bpaPhaseOutEnd: number;
    canadaEmploymentAmount: number;
  };
  ontario: {
    brackets: Bracket[];
    creditRate: number;
    bpa: number;
    surtax: { threshold1: number; rate1: number; threshold2: number; rate2: number };
    /** Ontario tax reduction basic amount (per individual). */
    taxReductionBasic: number;
    /** Low-income Individuals and Families Tax (LIFT) credit, single filer. */
    lift: { rate: number; max: number; phaseOutStart: number; phaseOutRate: number };
    healthPremium: HealthPremiumTier[];
  };
  cpp: {
    /** Total employee CPP1 rate (base + first additional). */
    rate: number;
    /** Base portion of the rate — eligible for the non-refundable credit. */
    baseRate: number;
    ympe: number;
    basicExemption: number;
    /** Second ceiling for CPP2. */
    yampe: number;
    cpp2Rate: number;
  };
  ei: {
    rate: number;
    maxInsurableEarnings: number;
  };
}

/**
 * Ontario Health Premium. The thresholds have not been indexed since the
 * premium was introduced (2004), so the same table is used every year.
 */
const ONTARIO_HEALTH_PREMIUM: HealthPremiumTier[] = [
  { from: 20_000, base: 0, rate: 0.06, cap: 300 },
  { from: 36_000, base: 300, rate: 0.06, cap: 450 },
  { from: 48_000, base: 450, rate: 0.25, cap: 600 },
  { from: 72_000, base: 600, rate: 0.25, cap: 750 },
  { from: 200_000, base: 750, rate: 0.25, cap: 900 },
];

export const TAX_2026: TaxYearConfig = {
  year: 2026,
  federal: {
    brackets: [
      { upTo: 58_523, rate: 0.14 },
      { upTo: 117_045, rate: 0.205 },
      { upTo: 181_440, rate: 0.26 },
      { upTo: 258_482, rate: 0.29 },
      { upTo: Infinity, rate: 0.33 },
    ],
    creditRate: 0.14,
    bpaMax: 16_452,
    bpaMin: 14_829,
    bpaPhaseOutStart: 181_440,
    bpaPhaseOutEnd: 258_482,
    canadaEmploymentAmount: 1_501,
  },
  ontario: {
    brackets: [
      { upTo: 53_891, rate: 0.0505 },
      { upTo: 107_785, rate: 0.0915 },
      { upTo: 150_000, rate: 0.1116 },
      { upTo: 220_000, rate: 0.1216 },
      { upTo: Infinity, rate: 0.1316 },
    ],
    creditRate: 0.0505,
    bpa: 12_989,
    surtax: { threshold1: 5_818, rate1: 0.2, threshold2: 7_446, rate2: 0.36 },
    taxReductionBasic: 300,
    lift: { rate: 0.0505, max: 875, phaseOutStart: 32_500, phaseOutRate: 0.05 },
    healthPremium: ONTARIO_HEALTH_PREMIUM,
  },
  cpp: {
    rate: 0.0595,
    baseRate: 0.0495,
    ympe: 74_600,
    basicExemption: 3_500,
    yampe: 85_000,
    cpp2Rate: 0.04,
  },
  ei: {
    rate: 0.0163,
    maxInsurableEarnings: 68_900,
  },
};

export const TAX_YEARS: Record<number, TaxYearConfig> = {
  2026: TAX_2026,
};

export const SUPPORTED_YEARS = Object.keys(TAX_YEARS)
  .map(Number)
  .sort((a, b) => b - a);

export const DEFAULT_YEAR = SUPPORTED_YEARS[0];

export function getTaxYear(year: number): TaxYearConfig {
  const config = TAX_YEARS[year];
  if (!config) throw new Error(`Unsupported tax year: ${year}`);
  return config;
}

/** Derived annual maximums (employee share). */
export function contributionMaximums(config: TaxYearConfig) {
  const { cpp, ei } = config;
  const cppMax = round2((cpp.ympe - cpp.basicExemption) * cpp.rate);
  return {
    cppMax,
    /** Base-portion maximum, used for the non-refundable credit. */
    cppBaseMax: round2(cppMax * (cpp.baseRate / cpp.rate)),
    cpp2Max: round2((cpp.yampe - cpp.ympe) * cpp.cpp2Rate),
    eiMax: round2(ei.maxInsurableEarnings * ei.rate),
  };
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
