import { useEffect, useState } from 'react';
import { DEFAULT_YEAR, SUPPORTED_YEARS } from './tax/config';
import type { CalculatorInput, RetirementInput } from './tax/calculator';

const STORAGE_KEY = 'ontario-tax-calculator:v1';

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function defaultInput(): CalculatorInput {
  const y = DEFAULT_YEAR;
  return {
    year: y,
    annualSalary: 120_000,
    frequency: 'biweekly',
    firstPayDate: `${y}-01-02`,
    perPay: { unionDues: 0, taxableBenefits: 0, postTax: 0 },
    retirement: defaultRetirement(),
    bonuses: [],
    rsuVests: [
      { id: newId(), date: `${y}-02-15`, amount: 10_000 },
      { id: newId(), date: `${y}-05-15`, amount: 10_000 },
      { id: newId(), date: `${y}-08-15`, amount: 10_000 },
      { id: newId(), date: `${y}-11-15`, amount: 10_000 },
    ],
    rsuCurrency: 'CAD',
    usdCad: 1.38,
    rsuWithholding: { method: 'bonus', flatRate: 0.4 },
    rsuSubjectToEi: true,
    rsuCppEiFromShares: false,
  };
}

function defaultRetirement(): RetirementInput {
  return {
    rpp: { mode: 'percent', value: 0 },
    groupRrsp: { mode: 'percent', value: 0 },
    match: { enabled: false, rate: 100, capPercent: 4, plan: 'rrsp', insurable: true },
    personalRrsp: 0,
  };
}

/** Shape saved by the first release (flat dollar amounts in perPay, personalRrsp at the top level). */
interface LegacyInput {
  perPay?: { rpp?: number; groupRrsp?: number };
  personalRrsp?: number;
}

/** Moves a date to another year, keeping month and day. */
export function withYear(iso: string, year: number): string {
  return `${year}${iso.slice(4)}`;
}

function load(): CalculatorInput {
  const fallback = defaultInput();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<CalculatorInput> & LegacyInput;
    const retirement: RetirementInput = saved.retirement
      ? {
          ...fallback.retirement,
          ...saved.retirement,
          match: { ...fallback.retirement.match, ...saved.retirement.match },
        }
      : {
          ...fallback.retirement,
          rpp: { mode: 'amount', value: saved.perPay?.rpp ?? 0 },
          groupRrsp: { mode: 'amount', value: saved.perPay?.groupRrsp ?? 0 },
          personalRrsp: saved.personalRrsp ?? 0,
        };
    const merged: CalculatorInput = {
      ...fallback,
      ...saved,
      perPay: {
        unionDues: saved.perPay?.unionDues ?? 0,
        taxableBenefits: saved.perPay?.taxableBenefits ?? 0,
        postTax: saved.perPay?.postTax ?? 0,
      },
      retirement,
      rsuWithholding: { ...fallback.rsuWithholding, ...saved.rsuWithholding },
    };
    if (!SUPPORTED_YEARS.includes(merged.year)) merged.year = DEFAULT_YEAR;
    return {
      ...merged,
      firstPayDate: withYear(merged.firstPayDate, merged.year),
      bonuses: merged.bonuses.map((b) => ({ ...b, date: withYear(b.date, merged.year) })),
      rsuVests: merged.rsuVests.map((v) => ({ ...v, date: withYear(v.date, merged.year) })),
    };
  } catch {
    return fallback;
  }
}

/** Calculator inputs, remembered in this browser only (nothing leaves the device). */
export function usePersistentInput() {
  const [input, setInput] = useState<CalculatorInput>(load);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(input));
    } catch {
      /* storage unavailable (private mode) — calculator still works */
    }
  }, [input]);
  return [input, setInput] as const;
}
