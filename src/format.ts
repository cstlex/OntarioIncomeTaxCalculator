const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 2 });
const cad0 = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('en-CA', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export const money = (n: number) => cad.format(n === 0 ? 0 : n);
export const money0 = (n: number) => cad0.format(Math.round(n) === 0 ? 0 : n);
export const percent = (n: number) => pct.format(Number.isFinite(n) ? n : 0);
export const shortDate = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`));
