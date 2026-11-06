import { useMemo } from 'react';
import { calculate } from './tax/calculator';
import { contributionMaximums, getTaxYear } from './tax/config';
import { defaultInput, usePersistentInput } from './state';
import { money } from './format';
import { InputPanel } from './components/InputPanel';
import { Summary } from './components/Summary';
import { PaycheckPhases } from './components/PaycheckPhases';
import { PaycheckChart } from './components/PaycheckChart';
import { RsuPanel } from './components/RsuPanel';
import { AnnualBreakdown } from './components/AnnualBreakdown';
import { PaycheckTable } from './components/PaycheckTable';
import { Faq } from './components/Faq';

function Logo() {
  return (
    <svg viewBox="0 0 512 512" className="h-9 w-9 shrink-0" aria-hidden="true">
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#D52B1E" />
          <stop offset="1" stopColor="#9E1B14" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#logo-bg)" />
      <g fill="#fff">
        <rect x="112" y="292" width="76" height="112" rx="14" />
        <rect x="218" y="222" width="76" height="182" rx="14" />
        <rect x="324" y="152" width="76" height="252" rx="14" />
        <rect x="96" y="108" width="320" height="22" rx="11" opacity="0.85" />
      </g>
    </svg>
  );
}

export default function App() {
  const [input, setInput] = usePersistentInput();
  const result = useMemo(() => calculate(input), [input]);
  const config = getTaxYear(input.year);
  const max = contributionMaximums(config);

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:px-6">
          <Logo />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Ontario Income Tax &amp; Paycheck Calculator</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {input.year} · paycheck-by-paycheck CPP, CPP2 &amp; EI · RSU vests
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <aside className="min-w-0">
          <InputPanel input={input} setInput={setInput} onReset={() => setInput(defaultInput())} />
        </aside>

        <div className="flex min-w-0 flex-col gap-6">
          <Summary result={result} />
          <PaycheckPhases result={result} />
          <PaycheckChart payroll={result.payroll} />
          <RsuPanel result={result} />
          <AnnualBreakdown result={result} />
          <PaycheckTable payroll={result.payroll} />
          <Faq config={config} />
        </div>
      </main>

      <footer className="border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 text-sm text-zinc-600 sm:px-6 md:grid-cols-2 dark:text-zinc-400">
          <div>
            <h2 className="mb-2 font-semibold text-zinc-900 dark:text-zinc-100">{input.year} limits used</h2>
            <ul className="tabular space-y-1">
              <li>
                CPP: {(config.cpp.rate * 100).toFixed(2)}% up to {money(config.cpp.ympe)} (YMPE), max {money(max.cppMax)}
              </li>
              <li>
                CPP2: {(config.cpp.cpp2Rate * 100).toFixed(0)}% from {money(config.cpp.ympe)} to {money(config.cpp.yampe)}{' '}
                (YAMPE), max {money(max.cpp2Max)}
              </li>
              <li>
                EI: {(config.ei.rate * 100).toFixed(2)}% up to {money(config.ei.maxInsurableEarnings)}, max {money(max.eiMax)}
              </li>
            </ul>
          </div>
          <div>
            <h2 className="mb-2 font-semibold text-zinc-900 dark:text-zinc-100">How it's calculated</h2>
            <p>
              Paychecks follow the CRA payroll deductions formulas (T4127): each paycheck is annualized, bonuses and RSU
              vests use the bonus method, and CPP/EI stop at their maximums. The annual return uses the federal and
              Ontario brackets, credits, surtax, tax reduction, LIFT credit and Ontario Health Premium for a single
              filer. Estimates only — not tax advice. Your inputs stay in this browser.
            </p>
            <p className="mt-2">
              <a
                className="font-medium text-brand-600 underline-offset-2 hover:underline dark:text-brand-500"
                href="https://github.com/cstlex/OntarioIncomeTaxCalculator"
              >
                Source on GitHub
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
