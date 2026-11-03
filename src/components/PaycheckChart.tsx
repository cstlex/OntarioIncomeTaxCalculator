import { useEffect, useRef, useState } from 'react';
import type { PayPeriod, PayrollResult } from '../tax/payroll';
import { money, money0, shortDate } from '../format';
import { Card } from './ui';
import { EVENT_LABEL } from './PaycheckPhases';

const SERIES = [
  { key: 'net', label: 'Net pay', color: 'var(--series-net)' },
  { key: 'tax', label: 'Income tax', color: 'var(--series-tax)' },
  { key: 'cpp', label: 'CPP', color: 'var(--series-cpp)' },
  { key: 'cpp2', label: 'CPP2', color: 'var(--series-cpp2)' },
  { key: 'ei', label: 'EI', color: 'var(--series-ei)' },
  { key: 'other', label: 'Other deductions', color: 'var(--series-other)' },
] as const;

type SeriesKey = (typeof SERIES)[number]['key'];

/** Splits the cash part of a paycheck into the stacked segments. */
export function cashSegments(p: PayPeriod): Record<SeriesKey, number> {
  const payroll = p.cpp + p.cpp2 + p.ei;
  const cashShare = payroll > 0 ? (payroll - p.rsuPayrollFromShares) / payroll : 1;
  return {
    net: p.netCash,
    tax: p.totalTax - p.rsuTaxWithheld,
    cpp: p.cpp * cashShare,
    cpp2: p.cpp2 * cashShare,
    ei: p.ei * cashShare,
    other: p.preTaxDeductions + p.postTaxDeductions,
  };
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function milestoneText(p: PayPeriod): string {
  return `${p.events
    .filter((e) => e.kind !== 'cpp2-start')
    .map((e) => EVENT_LABEL[e.kind].replace(' maxed', ''))
    .join('/')} max`;
}

function niceMax(value: number): number {
  if (value <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(value));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * pow >= value) return m * pow;
  }
  return 10 * pow;
}

export function PaycheckChart({ payroll }: { payroll: PayrollResult }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const periods = payroll.periods;
  const height = 260;
  const margin = { top: 44, right: 8, bottom: 26, left: 52 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const segs = periods.map(cashSegments);
  const totals = segs.map((s) => SERIES.reduce((acc, { key }) => acc + Math.max(0, s[key]), 0));
  const yMax = niceMax(Math.max(...totals, 1));
  const y = (v: number) => innerH - (v / yMax) * innerH;
  const slot = innerW / periods.length;
  const barW = Math.max(2, Math.min(28, slot * 0.72));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * yMax);
  const labelEvery = Math.ceil(periods.length / Math.max(4, Math.floor(innerW / 64)));

  // Milestone labels: place on one of two rows so neighbours don't collide; skip if both rows are taken
  // (the milestones list above always has the full detail).
  const labelRows: (number | null)[] = [];
  const rowEnd = [-Infinity, -Infinity];
  periods.forEach((p, i) => {
    const evs = p.events.filter((e) => e.kind !== 'cpp2-start');
    if (evs.length === 0) return void (labelRows[i] = null);
    const text = milestoneText(p);
    const half = (text.length * 5.6) / 2;
    const cx = i * slot + slot / 2;
    const row = rowEnd.findIndex((end) => cx - half > end + 4);
    labelRows[i] = row === -1 ? null : row;
    if (row !== -1) rowEnd[row] = cx + half;
  });

  const hovered = hover !== null ? periods[hover] : null;
  const hoveredSeg = hover !== null ? segs[hover] : null;

  return (
    <Card
      title="Every paycheck"
      subtitle="Cash paycheck split into net pay and deductions. RSU withholding happens in shares and is not shown here."
    >
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-zinc-900 dark:bg-zinc-100" />
          RSU vest / bonus
        </li>
      </ul>
      <div ref={ref} className="relative w-full">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Stacked bar chart of each paycheck's net pay, income tax, CPP, CPP2, EI and other deductions"
          onMouseLeave={() => setHover(null)}
        >
          <g transform={`translate(${margin.left},${margin.top})`}>
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={0}
                  x2={innerW}
                  y1={y(t)}
                  y2={y(t)}
                  className={t === 0 ? 'stroke-zinc-300 dark:stroke-zinc-700' : 'stroke-zinc-200 dark:stroke-zinc-800'}
                  strokeWidth={1}
                />
                <text
                  x={-8}
                  y={y(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="tabular fill-zinc-500 text-[11px] dark:fill-zinc-400"
                >
                  {money0(t)}
                </text>
              </g>
            ))}
            {periods.map((p, i) => {
              const x = i * slot + (slot - barW) / 2;
              let acc = 0;
              const s = segs[i];
              const eventsHere = p.events.filter((e) => e.kind !== 'cpp2-start');
              return (
                <g key={p.index} opacity={hover === null || hover === i ? 1 : 0.45}>
                  {SERIES.map(({ key, color }) => {
                    const v = Math.max(0, s[key]);
                    if (v <= 0) return null;
                    const y0 = y(acc);
                    acc += v;
                    const y1 = y(acc);
                    // 2px surface gap between stacked segments.
                    const h = Math.max(0, y0 - y1);
                    return (
                      <rect
                        key={key}
                        x={x}
                        y={y1 + 1}
                        width={barW}
                        height={Math.max(0, h - 2)}
                        rx={Math.min(3, barW / 4)}
                        fill={color}
                      />
                    );
                  })}
                  {(p.rsu > 0 || p.bonus > 0) && (
                    <circle cx={x + barW / 2} cy={y(totals[i]) - 8} r={3.5} className="fill-zinc-900 dark:fill-zinc-100" />
                  )}
                  {eventsHere.length > 0 && labelRows[i] !== null && (
                    <text
                      x={x + barW / 2}
                      y={labelRows[i] === 0 ? -18 : -30}
                      textAnchor="middle"
                      className="fill-zinc-500 text-[10px] font-medium dark:fill-zinc-400"
                    >
                      {milestoneText(p)}
                    </text>
                  )}
                  {i % labelEvery === 0 && (
                    <text
                      x={x + barW / 2}
                      y={innerH + 16}
                      textAnchor="middle"
                      className="fill-zinc-500 text-[11px] dark:fill-zinc-400"
                    >
                      {shortDate(p.date)}
                    </text>
                  )}
                  {/* Hit target: the full column. */}
                  <rect
                    x={i * slot}
                    y={-margin.top}
                    width={slot}
                    height={innerH + margin.top}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onTouchStart={() => setHover(i)}
                  />
                </g>
              );
            })}
          </g>
        </svg>
        {hovered && hoveredSeg && (
          <div
            className="pointer-events-none absolute top-2 z-10 w-56 rounded-lg border border-zinc-200 bg-white/95 p-3 text-xs shadow-lg backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95"
            style={{
              left: Math.min(
                Math.max(0, margin.left + hovered.index * slot + slot / 2 - 112),
                Math.max(0, width - 224),
              ),
            }}
          >
            <div className="mb-1 font-semibold">
              Paycheck #{hovered.index + 1} · {shortDate(hovered.date)}
            </div>
            <dl className="tabular grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-zinc-600 dark:text-zinc-300">
              <dt>Cash gross</dt>
              <dd className="text-right">{money(hovered.regularGross + hovered.bonus)}</dd>
              {hovered.rsu > 0 && (
                <>
                  <dt>RSU vest</dt>
                  <dd className="text-right">{money(hovered.rsu)}</dd>
                </>
              )}
              {SERIES.slice(1).map(({ key, label, color }) =>
                hoveredSeg[key] > 0.004 ? (
                  <div key={key} className="contents">
                    <dt className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
                      {label}
                    </dt>
                    <dd className="text-right">−{money(hoveredSeg[key])}</dd>
                  </div>
                ) : null,
              )}
              <dt className="mt-1 flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-50">
                <span className="h-2 w-2 rounded-sm" style={{ background: 'var(--series-net)' }} />
                Net pay
              </dt>
              <dd className="mt-1 text-right font-semibold text-zinc-900 dark:text-zinc-50">{money(hovered.netCash)}</dd>
            </dl>
          </div>
        )}
      </div>
    </Card>
  );
}
