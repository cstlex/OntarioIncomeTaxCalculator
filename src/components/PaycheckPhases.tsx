import type { CalculatorResult, PayPhase } from '../tax/calculator';
import type { PayPeriod, PayrollEventKind } from '../tax/payroll';
import { money, shortDate } from '../format';
import { Card } from './ui';

export const EVENT_LABEL: Record<PayrollEventKind, string> = {
  'ei-max': 'EI maxed',
  'cpp-max': 'CPP maxed',
  'cpp2-start': 'CPP2 starts',
  'cpp2-max': 'CPP2 maxed',
};

function Chip({ on, children }: { on: boolean; children: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        on
          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
          : 'bg-zinc-100 text-zinc-400 line-through dark:bg-zinc-800 dark:text-zinc-500'
      }`}
    >
      {children}
    </span>
  );
}

function phaseTitle(phase: PayPhase, index: number): string {
  if (index === 0) return 'Start of year';
  const { cpp, cpp2, ei } = phase.deducting;
  if (!cpp && !cpp2 && !ei) return 'Everything maxed';
  return phase.trigger.map((e) => EVENT_LABEL[e.kind]).join(' + ') || 'Next phase';
}

function paycheckLabel(p: PayPeriod) {
  return `#${p.index + 1} · ${shortDate(p.date)}`;
}

export function PaycheckPhases({ result }: { result: CalculatorResult }) {
  const { phases, payroll } = result;
  const events = payroll.events;
  return (
    <Card
      title="Your paycheck through the year"
      subtitle="CPP, CPP2 and EI come off every paycheck until each hits its annual maximum — then your net pay goes up."
    >
      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {phases.map((phase, i) => {
          const prev = phases[i - 1];
          const diff = prev ? phase.sample.netCash - prev.sample.netCash : 0;
          const { sample } = phase;
          const count = phase.end - phase.start + 1;
          return (
            <li
              key={phase.start}
              className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="text-xs font-semibold tracking-wide text-brand-600 uppercase dark:text-brand-500">
                {phaseTitle(phase, i)}
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                Paycheck {phase.start + 1}
                {count > 1 ? `–${phase.end + 1}` : ''} · {shortDate(phase.startDate)}
                {count > 1 ? ` – ${shortDate(phase.endDate)}` : ''}
              </div>
              <div className="tabular text-2xl font-semibold tracking-tight">{money(sample.netCash)}</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                net per regular paycheck
                {prev && Math.abs(diff) >= 0.01 && (
                  <span className="ml-1 font-semibold text-emerald-700 dark:text-emerald-400">
                    ({diff > 0 ? '+' : '−'}
                    {money(Math.abs(diff))})
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                <Chip on={phase.deducting.cpp}>CPP</Chip>
                <Chip on={phase.deducting.cpp2}>CPP2</Chip>
                <Chip on={phase.deducting.ei}>EI</Chip>
              </div>
              <dl className="tabular mt-1 grid grid-cols-2 gap-x-2 text-xs text-zinc-600 dark:text-zinc-400">
                <dt>CPP</dt>
                <dd className="text-right">{money(sample.cpp)}</dd>
                <dt>CPP2</dt>
                <dd className="text-right">{money(sample.cpp2)}</dd>
                <dt>EI</dt>
                <dd className="text-right">{money(sample.ei)}</dd>
                <dt>Income tax</dt>
                <dd className="text-right">{money(sample.totalTax - sample.rsuTaxWithheld)}</dd>
              </dl>
            </li>
          );
        })}
      </ol>

      {events.length > 0 ? (
        <div className="mt-4 rounded-xl bg-zinc-50 p-4 text-sm dark:bg-zinc-950">
          <div className="mb-2 font-medium">Milestones</div>
          <ul className="flex flex-col gap-1 text-zinc-600 dark:text-zinc-400">
            {events.map((e) => {
              const p = payroll.periods[e.periodIndex];
              return (
                <li key={`${e.kind}-${e.periodIndex}`} className="flex justify-between gap-4">
                  <span>{EVENT_LABEL[e.kind]}</span>
                  <span className="tabular">paycheck {paycheckLabel(p)}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            The paycheck where a maximum is reached only deducts the remainder, so it sits between two phases.
            RSU vests and bonuses count toward the maximums and pull these dates earlier.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          Your earnings don't reach any CPP or EI maximum this year, so every regular paycheck is the same.
        </p>
      )}
    </Card>
  );
}
