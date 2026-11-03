# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Copilot, Cursor, …) working in this repository.
`CLAUDE.md` only imports this file, so keep everything here.

## Working agreements

- **Branch:** the default and deploy branch is `master` (not `main`). Every push to `master` deploys to GitHub Pages.
- **Language:** talk to the maintainer in **Korean**. Write code, comments, commit messages and documentation in **English**.
- Ask before guessing when tax rules or numbers are uncertain — a wrong number is worse than a missing feature.
- Keep the app fully static and client-side. User inputs must never leave the browser (no analytics, no backend).

## Project

Ontario income tax & paycheck calculator for employees. Its reasons to exist:

1. **Paycheck-by-paycheck CPP / CPP2 / EI.** Contributions are a fixed percentage of each paycheck until the
   annual maximum is reached, then they stop. The app shows net pay in every phase (all deducting → EI maxed →
   CPP maxed / CPP2 running → everything maxed) and on which paycheck each maximum is hit.
2. **RSU vests.** Vests are employment income on the paycheck after the vest date. The app shows the effective and
   marginal tax rate on RSU income, CPP/EI caused by vests, and whether sell-to-cover withholding is enough.
3. Everything else deducted on a pay stub: federal tax, Ontario tax, Ontario Health Premium, RPP, group RRSP,
   union dues, taxable benefits and after-tax deductions.

## Stack & commands

- Vite 8 + React 19 + TypeScript (strict) + Tailwind CSS v4 (`@tailwindcss/vite`, configured in `src/index.css`)
- Vitest for the tax engine
- Node version: `.nvmrc` (22)

```bash
npm install
npm run dev        # local dev server
npm test           # tax engine tests (must pass before every commit)
npm run build      # type-check + production build into dist/
npm run icons      # regenerate favicons / app icons / og-image into public/
```

## Layout

```
src/
  tax/                 Pure, framework-free tax engine (no React imports here)
    config.ts          All rates, thresholds and constants per tax year
    annual.ts          Annual return: T1 + ON428 (brackets, credits, surtax, reduction, LIFT, health premium)
    payroll.ts         Per-paycheck simulation (CRA T4127 payroll formulas, bonus method, CPP/CPP2/EI caps)
    calculator.ts      Combines payroll + annual: refund/owing, RSU analysis, paycheck phases
    tax.test.ts        Tests with hand-checked expected values
  components/          UI (Card, inputs, summary, phases, chart, RSU panel, breakdown, table)
  state.ts             Defaults + localStorage persistence
  format.ts            Currency / percent / date formatting
public/                Static files copied as-is: favicons, manifest, og-image, CNAME
scripts/generate-icons.mjs   Icon generator (sharp); output is committed
.github/workflows/deploy.yml Build, test and deploy to GitHub Pages
```

## Tax engine rules

- Every number lives in `src/tax/config.ts`. Never hard-code a rate or threshold anywhere else.
- **Adding a tax year:** copy the latest `TaxYearConfig`, update every value from the sources below, add it to
  `TAX_YEARS`, and add a test with a hand-computed annual result (see the `$100,000` test). Values to update:
  federal brackets, BPA (max/min and phase-out range = 4th/5th bracket thresholds), Canada employment amount,
  Ontario brackets (the $150,000 and $220,000 thresholds are not indexed), Ontario BPA, surtax thresholds,
  tax reduction amount, CPP YMPE / YAMPE / rates, EI rate / maximum insurable earnings. The Ontario Health
  Premium and LIFT thresholds are not indexed.
- Rounding: per-paycheck amounts are rounded to cents; CPP/CPP2/EI must total exactly the annual maximum.
- Payroll withholding follows T4127 (annualize × pay periods, K1/K2/K4 credits, F5 enhanced-CPP deduction,
  Ontario surtax V1, health premium V2, tax reduction S, bonus method for bonuses and RSU vests).
  Known simplifications: no TD1 claim amounts other than the basic personal amounts, no 53/27-pay years,
  single filer, no Quebec.
- The annual return is a single-filer employment-income return: no dependants, spouse, other income or
  refundable credits (e.g. Canada Workers Benefit).
- Run `npm test` after any engine change and add a test for any new rule.

## Tax data sources (2026)

- CRA T4127 Payroll Deductions Formulas, 122nd edition (Jan 1, 2026):
  https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas.html
- CPP 2026: YMPE $74,600, YAMPE $85,000, 5.95% / 4%, max $4,230.45 / $416.
- EI 2026: 1.63%, maximum insurable earnings $68,900, max premium $1,123.07.
- Federal 2026 (indexation 2.0%): 14% / 20.5% / 26% / 29% / 33% at $58,523 / $117,045 / $181,440 / $258,482;
  BPA $16,452 → $14,829; Canada employment amount $1,501.
- Ontario 2026 (indexation 1.9%): 5.05% / 9.15% / 11.16% / 12.16% / 13.16% at $53,891 / $107,785 / $150,000 /
  $220,000; BPA $12,989; surtax 20% over $5,818 and 36% over $7,446; tax reduction $300; LIFT max $875,
  reduced by 5% of net income over $32,500.

## UI conventions

- Tailwind utility classes only; brand colours are defined in `@theme` in `src/index.css`.
- Light and dark mode both supported (`prefers-color-scheme`). Check both, plus a 390px-wide viewport
  (no horizontal page scroll).
- Chart series colours are the CSS variables `--series-*` in `src/index.css` (a validated colour-blind-safe
  order — keep the order, don't cycle colours). The chart must keep its legend and the table view.
- Asset URLs must stay relative (`base: './'` in `vite.config.ts`) so the build works on both the custom
  domain and `https://cstlex.github.io/OntarioIncomeTaxCalculator/`.

## Deployment

- `.github/workflows/deploy.yml` runs on every push to `master`: `npm ci` → `npm test` → `npm run build` →
  deploy `dist/` with GitHub Pages (source: **GitHub Actions**).
- Custom domain: `tax.minsookim.dev` (`public/CNAME`, plus Settings → Pages → Custom domain).
- Favicons: if the logo changes, edit `scripts/generate-icons.mjs` and the inline `Logo` in `src/App.tsx`,
  then run `npm run icons` and commit the regenerated files in `public/`.
