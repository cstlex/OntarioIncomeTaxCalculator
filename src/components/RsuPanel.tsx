import type { CalculatorResult } from '../tax/calculator';
import { money0, percent } from '../format';
import { Card } from './ui';

function Row({ label, value, strong, hint }: { label: string; value: string; strong?: boolean; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className={strong ? 'font-medium' : 'text-zinc-600 dark:text-zinc-400'}>
        {label}
        {hint && <span className="block text-xs text-zinc-500 dark:text-zinc-500">{hint}</span>}
      </dt>
      <dd className={`tabular text-right ${strong ? 'font-semibold' : ''}`}>{value}</dd>
    </div>
  );
}

export function RsuPanel({ result }: { result: CalculatorResult }) {
  const rsu = result.rsu;
  if (!rsu) {
    return (
      <Card title="RSU tax rate">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Add an RSU vest to see what tax rate your vests are really taxed at and whether your employer's
          withholding covers it.
        </p>
      </Card>
    );
  }
  const short = rsu.shortfall > 0.5;
  return (
    <Card
      title="RSU tax rate"
      subtitle="RSUs are taxed as employment income when they vest — on top of your salary, so at your highest brackets."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-950">
          <div className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            Effective tax rate on RSU
          </div>
          <div className="mt-1 text-3xl font-semibold tracking-tight">{percent(rsu.effectiveTaxRate)}</div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Income tax only</div>
        </div>
        <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-950">
          <div className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            Incl. CPP / EI
          </div>
          <div className="mt-1 text-3xl font-semibold tracking-tight">{percent(rsu.effectiveTotalRate)}</div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {rsu.incrementalPayroll > 0 ? `+${money0(rsu.incrementalPayroll)} CPP/EI from vests` : 'Salary alone already maxes CPP/EI'}
          </div>
        </div>
        <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-950">
          <div className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            Top marginal rate
          </div>
          <div className="mt-1 text-3xl font-semibold tracking-tight">{percent(rsu.marginalTaxRate)}</div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">On your last RSU dollar</div>
        </div>
      </div>

      <dl className="mt-4 divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
        <Row label="Total RSU vested" value={money0(rsu.totalRsu)} />
        <Row label="Extra income tax caused by RSU" value={money0(rsu.incrementalTax)} hint="Tax with RSU − tax without RSU" />
        <Row label="Withheld on vests (sell-to-cover)" value={money0(rsu.withheld)} />
        <Row
          label={short ? 'Under-withheld on RSU' : 'Over-withheld on RSU'}
          value={money0(Math.abs(rsu.shortfall))}
          strong
          hint={
            short
              ? 'Expect to pay this at tax time unless other withholding covers it'
              : 'Comes back as part of your refund'
          }
        />
        <Row
          label="Withholding rate that would break even"
          value={percent(rsu.effectiveTaxRate)}
          hint="Ask payroll for this rate, or set money aside"
        />
      </dl>
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        Your cost base (ACB) for the shares is their value at vest, so selling right away has little or no capital
        gain. Gains or losses after vesting are taxed separately as capital gains.
      </p>
    </Card>
  );
}
