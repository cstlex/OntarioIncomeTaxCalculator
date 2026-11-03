import type { ReactNode } from 'react';
import type { CalculatorResult } from '../tax/calculator';
import { money } from '../format';
import { Card } from './ui';

function Line({
  label,
  value,
  sign = '',
  strong,
  muted,
}: {
  label: string;
  value: number;
  sign?: '' | '+' | '−';
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <tr className={strong ? 'font-semibold' : muted ? 'text-zinc-500 dark:text-zinc-400' : ''}>
      <td className="py-1 pr-4">{label}</td>
      <td className="tabular py-1 text-right whitespace-nowrap">
        {sign && value !== 0 ? `${sign} ` : ''}
        {money(value)}
      </td>
    </tr>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{children}</tbody>
      </table>
    </div>
  );
}

export function AnnualBreakdown({ result }: { result: CalculatorResult }) {
  const { annual, deductions, payroll, retirement } = result;
  const r = retirement.annual;
  return (
    <Card title="Annual tax return" subtitle="What you owe for the year (T1 + ON428), single filer with employment income.">
      <div className="grid gap-6 md:grid-cols-3">
        <Section title="Income">
          <Line label="Employment income" value={annual.employmentIncome} />
          {deductions.employerRrsp > 0 && (
            <Line label="incl. employer RRSP match" value={deductions.employerRrsp} muted />
          )}
          <Line label="Enhanced CPP / CPP2 deduction" value={annual.enhancedCppDeduction} sign="−" />
          {deductions.rpp > 0 && <Line label="RPP contributions" value={deductions.rpp} sign="−" />}
          {deductions.groupRrsp + deductions.employerRrsp + deductions.personalRrsp > 0 && (
            <Line
              label="RRSP deduction"
              value={deductions.groupRrsp + deductions.employerRrsp + deductions.personalRrsp}
              sign="−"
            />
          )}
          {deductions.unionDues > 0 && <Line label="Union dues" value={deductions.unionDues} sign="−" />}
          <Line label="Taxable income" value={annual.taxableIncome} strong />
        </Section>
        <Section title="Federal">
          <Line label="Tax on taxable income" value={annual.federal.bracketTax} />
          <Line label="Non-refundable credits" value={annual.federal.credits} sign="−" />
          <Line label="Basic personal amount used" value={annual.federal.bpa} muted />
          <Line label="Federal tax" value={annual.federal.tax} strong />
        </Section>
        <Section title="Ontario">
          <Line label="Tax on taxable income" value={annual.ontario.bracketTax} />
          <Line label="Non-refundable credits" value={annual.ontario.credits} sign="−" />
          <Line label="Surtax" value={annual.ontario.surtax} sign="+" />
          {annual.ontario.taxReduction > 0 && (
            <Line label="Ontario tax reduction" value={annual.ontario.taxReduction} sign="−" />
          )}
          {annual.ontario.lift > 0 && <Line label="LIFT credit" value={annual.ontario.lift} sign="−" />}
          <Line label="Ontario Health Premium" value={annual.ontario.healthPremium} sign="+" />
          <Line label="Ontario tax" value={annual.ontario.tax + annual.ontario.healthPremium} strong />
        </Section>
      </div>
      <div className="mt-6 grid gap-6 border-t border-zinc-200 pt-4 md:grid-cols-3 dark:border-zinc-800">
        <Section title="Withheld on paychecks">
          <Line label="Federal tax" value={payroll.totals.tax.federal} />
          <Line label="Ontario tax" value={payroll.totals.tax.ontario} />
          <Line label="Ontario Health Premium" value={payroll.totals.tax.healthPremium} />
          {payroll.totals.rsuFlatTax > 0 && <Line label="RSU flat-rate withholding" value={payroll.totals.rsuFlatTax} />}
          <Line label="Total withheld" value={payroll.totals.totalTax} strong />
        </Section>
        <Section title="Settling up">
          <Line label="Total income tax owed" value={annual.totalIncomeTax} />
          <Line label="Total withheld" value={payroll.totals.totalTax} />
          <Line
            label={result.refund >= 0 ? 'Refund' : 'Balance owing'}
            value={Math.abs(result.refund)}
            strong
          />
          <Line label="CPP / CPP2 / EI paid" value={annual.cpp1 + annual.cpp2 + annual.ei} muted />
        </Section>
        <Section title="Retirement savings">
          <Line label="Your RPP" value={r.rpp} />
          <Line label="Your group RRSP" value={r.groupRrsp} />
          <Line
            label={retirement.plan === 'dpsp' ? 'Employer match (DPSP)' : 'Employer match (RRSP)'}
            value={r.employerMatch}
          />
          <Line label="Personal RRSP" value={r.personalRrsp} />
          <Line label="Total saved" value={r.total} strong />
          <Line
            label="RRSP deduction used"
            value={deductions.groupRrsp + deductions.employerRrsp + deductions.personalRrsp}
            muted
          />
        </Section>
      </div>
    </Card>
  );
}
