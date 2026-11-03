import type { Dispatch, SetStateAction } from 'react';
import { SUPPORTED_YEARS } from '../tax/config';
import {
  resolveRetirement,
  type CalculatorInput,
  type ContributionSetting,
  type OtherPerPay,
  type RetirementInput,
} from '../tax/calculator';
import { PERIODS_PER_YEAR, type PayFrequency } from '../tax/payroll';
import { newId, withYear } from '../state';
import { money } from '../format';
import {
  Card,
  DateInput,
  Field,
  IconButton,
  MoneyInput,
  NumberInput,
  Segmented,
  Select,
  Toggle,
  TrashIcon,
} from './ui';

type Setter = Dispatch<SetStateAction<CalculatorInput>>;

const FREQUENCIES: { value: PayFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly (52)' },
  { value: 'biweekly', label: 'Bi-weekly (26)' },
  { value: 'semimonthly', label: 'Semi-monthly (24)' },
  { value: 'monthly', label: 'Monthly (12)' },
];

function LumpList({
  items,
  onChange,
  year,
  label,
  currency,
  addLabel,
}: {
  items: { id: string; date: string; amount: number }[];
  onChange: (items: { id: string; date: string; amount: number }[]) => void;
  year: number;
  label: string;
  currency: string;
  addLabel: string;
}) {
  const update = (id: string, patch: Partial<{ date: string; amount: number }>) =>
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && <p className="text-sm text-zinc-500 dark:text-zinc-400">None added.</p>}
      {items.map((it, i) => (
        <div key={it.id} className="flex items-center gap-2">
          <div className="w-[9.5rem] shrink-0">
            <DateInput
              ariaLabel={`${label} ${i + 1} date`}
              value={it.date}
              min={`${year}-01-01`}
              max={`${year}-12-31`}
              onChange={(date) => update(it.id, { date })}
            />
          </div>
          <div className="min-w-0 flex-1">
            <MoneyInput
              ariaLabel={`${label} ${i + 1} amount (${currency})`}
              value={it.amount}
              onChange={(amount) => update(it.id, { amount })}
              suffix={currency}
            />
          </div>
          <IconButton label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => onChange(items.filter((x) => x.id !== it.id))}>
            <TrashIcon />
          </IconButton>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const last = items[items.length - 1];
          onChange([...items, { id: newId(), date: last?.date ?? `${year}-03-15`, amount: last?.amount ?? 0 }]);
        }}
        className="self-start rounded-lg border border-dashed border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:border-brand-500 hover:text-brand-600 dark:border-zinc-700 dark:text-zinc-300"
      >
        + {addLabel}
      </button>
    </div>
  );
}

export function InputPanel({ input, setInput, onReset }: { input: CalculatorInput; setInput: Setter; onReset: () => void }) {
  const set = <K extends keyof CalculatorInput>(key: K, value: CalculatorInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }));
  const setPerPay = (key: keyof OtherPerPay, value: number) =>
    setInput((prev) => ({ ...prev, perPay: { ...prev.perPay, [key]: value } }));
  const setRetirement = (patch: Partial<RetirementInput>) =>
    setInput((prev) => ({ ...prev, retirement: { ...prev.retirement, ...patch } }));
  const setMatch = (patch: Partial<RetirementInput['match']>) =>
    setInput((prev) => ({
      ...prev,
      retirement: { ...prev.retirement, match: { ...prev.retirement.match, ...patch } },
    }));
  const basePerPay = input.annualSalary / PERIODS_PER_YEAR[input.frequency];
  const resolved = resolveRetirement(input.retirement, input.annualSalary, input.frequency);
  const { match } = input.retirement;
  const weeklyish = input.frequency === 'weekly' || input.frequency === 'biweekly';

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Income"
        actions={
          <button
            type="button"
            onClick={onReset}
            className="text-sm font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
          >
            Reset
          </button>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <Field label="Tax year" htmlFor="year">
            <Select
              id="year"
              value={input.year}
              onChange={(year) =>
                setInput((prev) => ({
                  ...prev,
                  year,
                  firstPayDate: withYear(prev.firstPayDate, year),
                  bonuses: prev.bonuses.map((b) => ({ ...b, date: withYear(b.date, year) })),
                  rsuVests: prev.rsuVests.map((v) => ({ ...v, date: withYear(v.date, year) })),
                }))
              }
              options={SUPPORTED_YEARS.map((y) => ({ value: y, label: String(y) }))}
            />
          </Field>
          <Field label="Annual base salary" htmlFor="salary">
            <MoneyInput id="salary" value={input.annualSalary} onChange={(v) => set('annualSalary', v)} decimals={0} />
          </Field>
          <Field label="Pay frequency" htmlFor="freq">
            <Select id="freq" value={input.frequency} onChange={(v) => set('frequency', v)} options={FREQUENCIES} />
          </Field>
          {weeklyish ? (
            <Field label="First pay date" htmlFor="firstpay">
              <DateInput
                id="firstpay"
                value={input.firstPayDate}
                min={`${input.year}-01-01`}
                max={`${input.year}-01-31`}
                onChange={(v) => set('firstPayDate', v)}
              />
            </Field>
          ) : (
            <Field label="Pay dates">
              <p className="py-2 text-sm text-zinc-500 dark:text-zinc-400">
                {input.frequency === 'monthly' ? 'Last day of each month' : '15th and last day of each month'}
              </p>
            </Field>
          )}
        </div>
      </Card>

      <Card
        title="RSU vests"
        subtitle="Vest value (FMV × shares) is employment income on the paycheck after the vest date."
      >
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Segmented
            ariaLabel="RSU currency"
            value={input.rsuCurrency}
            onChange={(v) => set('rsuCurrency', v)}
            options={[
              { value: 'CAD', label: 'CAD' },
              { value: 'USD', label: 'USD' },
            ]}
          />
          {input.rsuCurrency === 'USD' && (
            <div className="flex items-center gap-2">
              <label htmlFor="fx" className="text-sm text-zinc-600 dark:text-zinc-400">
                USD→CAD
              </label>
              <div className="w-24">
                <NumberInput id="fx" value={input.usdCad} onChange={(v) => set('usdCad', v)} decimals={4} />
              </div>
            </div>
          )}
        </div>
        <LumpList
          items={input.rsuVests}
          onChange={(v) => set('rsuVests', v)}
          year={input.year}
          label="Vest"
          currency={input.rsuCurrency}
          addLabel="Add vest"
        />
        <div className="mt-4 flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <Field label="Employer withholding on vests">
            <div className="flex flex-wrap items-center gap-3">
              <Segmented
                ariaLabel="RSU withholding method"
                value={input.rsuWithholding.method}
                onChange={(method) => set('rsuWithholding', { ...input.rsuWithholding, method })}
                options={[
                  { value: 'bonus', label: 'CRA bonus method' },
                  { value: 'flat', label: 'Flat rate' },
                ]}
              />
              {input.rsuWithholding.method === 'flat' && (
                <div className="w-24">
                  <NumberInput
                    ariaLabel="Flat withholding rate"
                    value={round(input.rsuWithholding.flatRate * 100)}
                    onChange={(v) => set('rsuWithholding', { ...input.rsuWithholding, flatRate: Math.min(100, v) / 100 })}
                    suffix="%"
                  />
                </div>
              )}
            </div>
          </Field>
          <Toggle
            checked={input.rsuSubjectToEi}
            onChange={(v) => set('rsuSubjectToEi', v)}
            label="RSU vests are subject to EI"
            hint="CPP always applies. Most RSU plans also deduct EI; some share-settled plans (treated like stock options) don't — check a vest paystub."
          />
          <Toggle
            checked={input.rsuCppEiFromShares}
            onChange={(v) => set('rsuCppEiFromShares', v)}
            label="Sell-to-cover also pays the CPP/EI on vests"
            hint="Off: CPP/EI caused by a vest comes out of that cash paycheck (common)."
          />
        </div>
      </Card>

      <Card title="Cash bonuses" subtitle="Withheld with the CRA bonus method.">
        <LumpList
          items={input.bonuses}
          onChange={(v) => set('bonuses', v)}
          year={input.year}
          label="Bonus"
          currency="CAD"
          addLabel="Add bonus"
        />
      </Card>

      <Card title="Retirement savings" subtitle="Per paycheck — in dollars or as a % of base salary.">
        <div className="flex flex-col gap-4">
          <Field label="Pension (RPP) contribution" hint="Pre-tax. Employer pension contributions aren't taxable, so leave them out.">
            <ContributionInput
              ariaLabel="RPP contribution"
              value={input.retirement.rpp}
              base={basePerPay}
              onChange={(rpp) => setRetirement({ rpp })}
            />
          </Field>
          <Field label="Group RRSP — your contribution" hint="Pre-tax through payroll.">
            <ContributionInput
              ariaLabel="Group RRSP contribution"
              value={input.retirement.groupRrsp}
              base={basePerPay}
              onChange={(groupRrsp) => setRetirement({ groupRrsp })}
            />
          </Field>
          <Toggle
            checked={match.enabled}
            onChange={(enabled) => setMatch({ enabled })}
            label="Employer matches my group RRSP"
          />
          {match.enabled && (
            <div className="flex flex-col gap-4 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-950">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Match rate" hint="Of your contribution">
                  <NumberInput
                    ariaLabel="Employer match rate"
                    value={match.rate}
                    onChange={(rate) => setMatch({ rate })}
                    suffix="%"
                  />
                </Field>
                <Field label="Up to" hint="% of salary (0 = no limit)">
                  <NumberInput
                    ariaLabel="Employer match limit, percent of salary"
                    value={match.capPercent}
                    onChange={(capPercent) => setMatch({ capPercent: Math.min(100, capPercent) })}
                    suffix="%"
                  />
                </Field>
              </div>
              <Field label="Employer money goes into">
                <Segmented
                  ariaLabel="Employer match plan"
                  value={match.plan}
                  onChange={(plan) => setMatch({ plan })}
                  options={[
                    { value: 'rrsp', label: 'Group RRSP' },
                    { value: 'dpsp', label: 'DPSP' },
                  ]}
                />
              </Field>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {match.plan === 'rrsp'
                  ? 'Group RRSP match is a taxable benefit that is deducted right back as an RRSP contribution: no extra income tax, but CPP (and usually EI) is charged on it and it uses your RRSP room.'
                  : 'DPSP contributions are not taxed when made and have no CPP or EI. They use part of your RRSP room (pension adjustment).'}
              </p>
              {match.plan === 'rrsp' && (
                <Toggle
                  checked={match.insurable}
                  onChange={(insurable) => setMatch({ insurable })}
                  label="Match is subject to EI"
                  hint="Yes unless the employer money can't be withdrawn until you retire or leave."
                />
              )}
            </div>
          )}
          <div className="tabular grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
            <span className="text-zinc-600 dark:text-zinc-400">You, per paycheck</span>
            <span className="text-right">{money(resolved.perPay.rpp + resolved.perPay.groupRrsp)}</span>
            {match.enabled && (
              <>
                <span className="text-zinc-600 dark:text-zinc-400">Employer, per paycheck</span>
                <span className="text-right">{money(resolved.perPay.employerMatch)}</span>
              </>
            )}
            <span className="font-medium">Per year (payroll)</span>
            <span className="text-right font-medium">
              {money(resolved.annual.rpp + resolved.annual.groupRrsp + resolved.annual.employerMatch)}
            </span>
          </div>
          <Field label="Personal RRSP (annual)" hint="Outside payroll — only affects the refund. Assumes you have enough RRSP room.">
            <MoneyInput
              value={input.retirement.personalRrsp}
              onChange={(personalRrsp) => setRetirement({ personalRrsp })}
              decimals={0}
            />
          </Field>
        </div>
      </Card>

      <Card title="Other payroll deductions" subtitle="Per paycheck, as shown on your pay stub.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <Field label="Union / professional dues" hint="Pre-tax">
            <MoneyInput value={input.perPay.unionDues} onChange={(v) => setPerPay('unionDues', v)} />
          </Field>
          <Field label="Taxable benefits" hint="Non-cash, e.g. employer-paid life insurance. Taxed + CPP, no EI.">
            <MoneyInput value={input.perPay.taxableBenefits} onChange={(v) => setPerPay('taxableBenefits', v)} />
          </Field>
          <Field label="After-tax deductions" hint="Benefit premiums, ESPP, charity, parking…">
            <MoneyInput value={input.perPay.postTax} onChange={(v) => setPerPay('postTax', v)} />
          </Field>
        </div>
      </Card>
    </div>
  );
}

/** Dollar-or-percent input. Switching the unit converts the current value. */
function ContributionInput({
  value,
  onChange,
  base,
  ariaLabel,
}: {
  value: ContributionSetting;
  onChange: (v: ContributionSetting) => void;
  /** Base salary per paycheck, used to convert between $ and %. */
  base: number;
  ariaLabel: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        {value.mode === 'percent' ? (
          <NumberInput
            ariaLabel={`${ariaLabel} (% of salary)`}
            value={value.value}
            onChange={(v) => onChange({ mode: 'percent', value: Math.min(100, v) })}
            suffix="%"
          />
        ) : (
          <MoneyInput
            ariaLabel={`${ariaLabel} ($ per paycheck)`}
            value={value.value}
            onChange={(v) => onChange({ mode: 'amount', value: v })}
          />
        )}
      </div>
      <Segmented
        ariaLabel={`${ariaLabel} unit`}
        value={value.mode}
        onChange={(mode) => {
          if (mode === value.mode) return;
          const converted =
            mode === 'percent'
              ? base > 0
                ? round((value.value / base) * 100)
                : 0
              : round((base * value.value) / 100);
          onChange({ mode, value: converted });
        }}
        options={[
          { value: 'percent', label: '%' },
          { value: 'amount', label: '$' },
        ]}
      />
    </div>
  );
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
