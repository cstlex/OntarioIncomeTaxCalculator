# Ontario Income Tax & Paycheck Calculator

**Live:** https://tax.minsookim.dev

An Ontario income tax calculator that simulates **every paycheck of the year**, not just an annual average.

Most online calculators divide your annual CPP and EI evenly across the year. Real payroll doesn't work that way:
CPP, CPP2 and EI are taken as a fixed percentage of each paycheck **until you hit the annual maximum, then they stop**,
so your net pay changes during the year. RSU vests make it even more lumpy — and most calculators ignore RSUs entirely.

## Features

- **Paycheck phases** — net pay while everything is deducted, after EI is maxed, after CPP is maxed (while CPP2 runs),
  and after everything is maxed, plus the exact paycheck and date each maximum is reached.
- **RSU vests** — enter vest dates and values (CAD or USD with an exchange rate). See the effective tax rate on your
  RSU income, the marginal rate on the last RSU dollar, the extra CPP/EI caused by vests, and whether your employer's
  sell-to-cover withholding (CRA bonus method or a flat rate) is enough.
- **Everything on the pay stub** — federal tax, Ontario tax, Ontario Health Premium, CPP, CPP2, EI, pension (RPP),
  group RRSP, union dues, taxable benefits and after-tax deductions (benefit premiums, ESPP, …).
- **Retirement savings** — RPP and group RRSP contributions in dollars or as a % of salary, plus an employer match
  (match rate, capped at a % of salary) into a group RRSP (taxable benefit + RRSP deduction, so CPP/EI apply) or a
  DPSP (not taxed, no CPP/EI).
- **Cash bonuses** withheld with the CRA bonus method.
- **Annual return** — federal and Ontario tax (brackets, credits, surtax, Ontario tax reduction, LIFT credit,
  health premium) compared with what was withheld: estimated refund or balance owing. Personal RRSP contributions included.
- Weekly, bi-weekly, semi-monthly and monthly pay; light and dark mode; works on mobile.
- Private: everything runs in your browser. Inputs are only remembered in your own browser's local storage.

## How it calculates

| Part | Method |
| --- | --- |
| CPP | 5.95% of pensionable earnings above the per-paycheck share of the $3,500 exemption, up to the yearly maximum |
| CPP2 | 4% of earnings between the YMPE and YAMPE, starting once year-to-date earnings pass the YMPE |
| EI | 1.63% of insurable earnings up to the yearly maximum |
| Paycheck income tax | CRA *Payroll Deductions Formulas* (T4127): each paycheck is annualized and taxed with the federal and Ontario formulas (incl. surtax, tax reduction and Ontario Health Premium); bonuses and RSU vests use the bonus method |
| Annual tax | Federal + Ontario brackets and non-refundable credits, enhanced-CPP deduction, Ontario surtax, tax reduction, LIFT credit and Ontario Health Premium |
| RSU tax rate | (tax with RSU − tax without RSU) ÷ RSU income |

### 2026 numbers

| | 2026 |
| --- | --- |
| CPP (YMPE / max) | $74,600 / $4,230.45 |
| CPP2 (YAMPE / max) | $85,000 / $416.00 |
| EI (max insurable / max premium) | $68,900 / $1,123.07 |
| Federal brackets | 14% · 20.5% · 26% · 29% · 33% at $58,523 / $117,045 / $181,440 / $258,482 |
| Ontario brackets | 5.05% · 9.15% · 11.16% · 12.16% · 13.16% at $53,891 / $107,785 / $150,000 / $220,000 |

Because the EI ceiling ($68,900) is lower than the CPP ceiling ($74,600), **EI is usually maxed first** for salaried
employees; CPP follows, and CPP2 keeps going until $85,000.

### Assumptions & limitations

- Single filer, Ontario resident all year, employment income only. No spouse/dependant credits, other income types
  or refundable credits such as the Canada Workers Benefit.
- Payroll uses the default TD1 claim (basic personal amounts). 53-week / 27-pay years are not modelled.
- Percentages for RPP / group RRSP / employer match are of base salary (bonuses and RSUs excluded). RRSP deductions
  assume you have enough contribution room.
- RSU vest value is taxed on the first paycheck on or after the vest date. Whether vests are subject to EI and
  whether CPP/EI on vests is covered by sell-to-cover can be toggled, since employers differ.
- Estimates only — this is not tax advice.

## Development

Requires Node 22 (see `.nvmrc`).

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tax engine tests
npm run build    # production build into dist/
npm run icons    # regenerate favicons and the social image from scripts/generate-icons.mjs
```

Tech: Vite, React, TypeScript, Tailwind CSS v4, Vitest. The tax engine in `src/tax/` is plain TypeScript with no UI
dependencies; all yearly rates live in `src/tax/config.ts`.

## Deployment

Pushing to `master` runs `.github/workflows/deploy.yml`, which tests, builds and deploys `dist/` to GitHub Pages.

## License

[MIT](LICENSE)
