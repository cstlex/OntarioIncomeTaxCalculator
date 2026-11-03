import { useState } from 'react';
import type { PayrollResult } from '../tax/payroll';
import { money, shortDate } from '../format';
import { Card } from './ui';
import { EVENT_LABEL } from './PaycheckPhases';

export function PaycheckTable({ payroll }: { payroll: PayrollResult }) {
  const [open, setOpen] = useState(true);
  const t = payroll.totals;
  const hasRsu = t.rsu > 0;
  const hasOther = t.preTaxDeductions + t.postTaxDeductions > 0;
  const rows = open ? payroll.periods : [];
  const th = 'px-2 py-2 text-right font-medium whitespace-nowrap';
  const td = 'px-2 py-1.5 text-right whitespace-nowrap';
  // "#" and "Date" stay pinned while the table scrolls sideways. Sticky cells need an opaque
  // background, and a right-edge line separates them from the scrolling columns.
  const pinNo = 'sticky left-0 z-10 w-10 min-w-10 px-2 text-left';
  const pinDate =
    'sticky left-10 z-10 min-w-[6.5rem] px-2 text-left shadow-[inset_-1px_0_0_var(--color-zinc-200)] dark:shadow-[inset_-1px_0_0_var(--color-zinc-800)]';
  const plainBg = 'bg-white dark:bg-zinc-900';
  const eventBg = 'bg-brand-50 dark:bg-[#2a1715]';
  return (
    <Card
      title="Paycheck table"
      subtitle="Every deduction on every paycheck, like a pay stub."
      actions={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {open ? 'Hide' : `Show all ${payroll.periods.length}`}
        </button>
      }
    >
      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <table className="tabular w-full min-w-[56rem] text-sm">
          <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <tr>
              <th className={`${pinNo} ${plainBg} py-2 font-medium`}>#</th>
              <th className={`${pinDate} ${plainBg} py-2 font-medium`}>Date</th>
              <th className={th}>Gross (cash)</th>
              {hasRsu && <th className={th}>RSU</th>}
              <th className={th}>CPP</th>
              <th className={th}>CPP2</th>
              <th className={th}>EI</th>
              <th className={th}>Federal tax</th>
              <th className={th}>Ontario tax</th>
              <th className={th}>Health premium</th>
              {hasRsu && <th className={th}>RSU withheld</th>}
              {hasOther && <th className={th}>Other</th>}
              <th className={th}>Net pay</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((p) => {
              const bg = p.events.length ? eventBg : plainBg;
              return (
                <tr key={p.index} className={bg}>
                  <td className={`${pinNo} ${bg} py-1.5 text-zinc-500`}>{p.index + 1}</td>
                  <td className={`${pinDate} ${bg} py-1.5 whitespace-nowrap`}>
                    {shortDate(p.date)}
                    {p.events.map((e) => (
                      <span key={e.kind} className="block text-[11px] leading-tight font-medium text-brand-600 dark:text-brand-500">
                        {EVENT_LABEL[e.kind]}
                      </span>
                    ))}
                  </td>
                  <td className={td}>{money(p.regularGross + p.bonus)}</td>
                  {hasRsu && <td className={td}>{p.rsu ? money(p.rsu) : '—'}</td>}
                  <td className={td}>{money(p.cpp)}</td>
                  <td className={td}>{money(p.cpp2)}</td>
                  <td className={td}>{money(p.ei)}</td>
                  <td className={td}>{money(p.tax.federal)}</td>
                  <td className={td}>{money(p.tax.ontario)}</td>
                  <td className={td}>{money(p.tax.healthPremium)}</td>
                  {hasRsu && <td className={td}>{p.rsuTaxWithheld ? money(p.rsuTaxWithheld) : '—'}</td>}
                  {hasOther && <td className={td}>{money(p.preTaxDeductions + p.postTaxDeductions)}</td>}
                  <td className={`${td} font-semibold`}>{money(p.netCash)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-zinc-200 font-semibold dark:border-zinc-700">
            <tr>
              <td className={`${pinNo} ${plainBg} py-2`}>Total</td>
              <td className={`${pinDate} ${plainBg} py-2`}>{payroll.periods.length} pays</td>
              <td className={td}>{money(t.regularGross + t.bonus)}</td>
              {hasRsu && <td className={td}>{money(t.rsu)}</td>}
              <td className={td}>{money(t.cpp)}</td>
              <td className={td}>{money(t.cpp2)}</td>
              <td className={td}>{money(t.ei)}</td>
              <td className={td}>{money(t.tax.federal)}</td>
              <td className={td}>{money(t.tax.ontario)}</td>
              <td className={td}>{money(t.tax.healthPremium)}</td>
              {hasRsu && <td className={td}>{money(t.rsuTaxWithheld)}</td>}
              {hasOther && <td className={td}>{money(t.preTaxDeductions + t.postTaxDeductions)}</td>}
              <td className={td}>{money(t.netCash)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {hasRsu && (
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          With the CRA bonus method, the federal / Ontario / health-premium columns include the tax on RSU vests;
          "RSU withheld" is the part of it covered by selling shares.
        </p>
      )}
    </Card>
  );
}
