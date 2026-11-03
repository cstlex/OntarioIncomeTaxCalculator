import type { CalculatorResult } from '../tax/calculator';
import { money0, percent } from '../format';
import { Stat } from './ui';

export function Summary({ result }: { result: CalculatorResult }) {
  const { annual, payroll, refund } = result;
  const payrollTotal = annual.cpp1 + annual.cpp2 + annual.ei;
  const owing = refund < -0.5;
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
      <Stat
        label="Employment income"
        value={money0(result.employmentIncome)}
        sub={payroll.totals.rsu > 0 ? `incl. ${money0(payroll.totals.rsu)} RSU` : 'T4 box 14'}
      />
      <Stat
        label="Income tax"
        value={money0(annual.totalIncomeTax)}
        sub={`${percent(result.averageTaxRate)} average · ${percent(result.marginal.incomeTax)} marginal`}
      />
      <Stat
        label="CPP + CPP2 + EI"
        value={money0(payrollTotal)}
        sub={`${money0(annual.cpp1)} + ${money0(annual.cpp2)} + ${money0(annual.ei)}`}
      />
      <Stat
        label="Cash take-home"
        value={money0(payroll.totals.netCash)}
        sub="Sum of all paycheck deposits"
      />
      {payroll.totals.rsu > 0 ? (
        <Stat label="RSU after withholding" value={money0(payroll.totals.rsuNet)} sub="Shares you keep (value at vest)" />
      ) : (
        <Stat
          label="Marginal rate"
          value={percent(result.marginal.withPayroll)}
          sub="On your next dollar, incl. CPP/EI"
        />
      )}
      <Stat
        label={owing ? 'Balance owing' : 'Estimated refund'}
        value={money0(Math.abs(refund))}
        tone={owing ? 'bad' : refund > 0.5 ? 'good' : 'default'}
        sub={`Withheld ${money0(payroll.totals.totalTax)} vs owed ${money0(annual.totalIncomeTax)}`}
      />
    </div>
  );
}
