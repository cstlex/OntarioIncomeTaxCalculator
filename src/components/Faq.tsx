import { contributionMaximums, type TaxYearConfig } from '../tax/config';
import { money0 } from '../format';

/**
 * Plain-language explanations shown under the calculator. Doubles as indexable page content,
 * so every number comes from the tax-year config.
 */
export function Faq({ config }: { config: TaxYearConfig }) {
  const max = contributionMaximums(config);
  const { cpp, ei, year } = config;
  const eiFirst = ei.maxInsurableEarnings < cpp.ympe;
  const items: { q: string; a: string[] }[] = [
    {
      q: 'Why does my paycheck go up later in the year?',
      a: [
        `CPP, CPP2 and EI are not spread evenly over the year. Payroll takes a fixed percentage of every paycheck — ${(cpp.rate * 100).toFixed(2)}% for CPP and ${(ei.rate * 100).toFixed(2)}% for EI in ${year} — until you reach the annual maximum (${money0(max.cppMax)} CPP, ${money0(max.cpp2Max)} CPP2, ${money0(max.eiMax)} EI). After that nothing more is deducted, so every remaining paycheck is bigger.`,
        'The calculator above shows your net pay in each phase and the exact paycheck where each maximum is reached.',
      ],
    },
    {
      q: 'Which maxes out first, CPP or EI?',
      a: [
        eiFirst
          ? `For a regular salary it is usually EI: in ${year} EI stops at ${money0(ei.maxInsurableEarnings)} of insurable earnings, while CPP continues until ${money0(cpp.ympe)} (the YMPE). CPP2 then applies at ${(cpp.cpp2Rate * 100).toFixed(0)}% on earnings between ${money0(cpp.ympe)} and ${money0(cpp.yampe)}, so it is the last to stop.`
          : `In ${year} CPP stops at ${money0(cpp.ympe)} (the YMPE) and EI at ${money0(ei.maxInsurableEarnings)} of insurable earnings. CPP2 then applies at ${(cpp.cpp2Rate * 100).toFixed(0)}% on earnings between ${money0(cpp.ympe)} and ${money0(cpp.yampe)}.`,
        'RSU vests and bonuses count toward these maximums, so a large vest can pull every maximum earlier in the year.',
      ],
    },
    {
      q: 'How are RSUs taxed in Ontario?',
      a: [
        'When RSUs vest, their fair market value is employment income on your paycheck — taxed like salary, on top of it, so at your highest marginal rate. CPP applies, and in most plans EI too, until you reach the maximums.',
        'Employers usually sell some shares to cover tax ("sell-to-cover"). If they withhold less than your marginal rate you will owe the difference when you file. Your cost base for the shares is their value at vest; any later gain or loss is a capital gain or loss.',
      ],
    },
    {
      q: 'Is my employer’s RRSP match taxed?',
      a: [
        'An employer contribution to a group RRSP is a taxable benefit, but it is deducted right back as an RRSP contribution, so it adds no income tax. It is still pensionable (CPP applies) and usually insurable (EI applies), and it uses your RRSP room. Employer contributions to a DPSP or a registered pension plan are not taxed when made and have no CPP or EI.',
      ],
    },
    {
      q: 'Why do I get a refund or owe tax at the end of the year?',
      a: [
        'Payroll estimates your tax one paycheck at a time. Bonuses and RSU vests are withheld with a separate method (or a flat rate), and deductions such as personal RRSP contributions only count when you file. The calculator compares the tax you actually owe for the year with everything withheld from your paychecks.',
      ],
    },
  ];

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-4 text-base font-semibold tracking-tight">Ontario paycheck &amp; tax FAQ</h2>
      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {items.map((item) => (
          <details key={item.q} className="group py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium">
              <h3>{item.q}</h3>
              <span aria-hidden="true" className="text-zinc-400 transition group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="mt-2 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              {item.a.map((p) => (
                <p key={p.slice(0, 32)}>{p}</p>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
