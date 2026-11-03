import { useEffect, useState } from 'react';
import { DEFAULT_YEAR, SUPPORTED_YEARS } from './tax/config';
import type { CalculatorInput } from './tax/calculator';

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
    perPay: { rpp: 0, groupRrsp: 0, unionDues: 0, taxableBenefits: 0, postTax: 0 },
    personalRrsp: 0,
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

function load(): CalculatorInput {
  const fallback = defaultInput();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<CalculatorInput>;
    const merged: CalculatorInput = {
      ...fallback,
      ...saved,
      perPay: { ...fallback.perPay, ...saved.perPay },
      rsuWithholding: { ...fallback.rsuWithholding, ...saved.rsuWithholding },
    };
    if (!SUPPORTED_YEARS.includes(merged.year)) merged.year = DEFAULT_YEAR;
    return merged;
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
