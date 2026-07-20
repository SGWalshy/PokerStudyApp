export type CurrencyCode = 'AUD' | 'USD' | 'GBP' | 'EUR' | 'CAD' | 'NZD';

export const DEFAULT_CURRENCY: CurrencyCode = 'AUD';

export const CURRENCIES: { code: CurrencyCode; label: string; symbol: string }[] = [
  { code: 'AUD', label: 'Australian Dollar', symbol: 'A$' },
  { code: 'USD', label: 'US Dollar', symbol: '$' },
  { code: 'GBP', label: 'British Pound', symbol: '£' },
  { code: 'EUR', label: 'Euro', symbol: '€' },
  { code: 'CAD', label: 'Canadian Dollar', symbol: 'C$' },
  { code: 'NZD', label: 'New Zealand Dollar', symbol: 'NZ$' },
];

export function currencySymbol(code: CurrencyCode): string {
  return CURRENCIES.find(c => c.code === code)?.symbol ?? '$';
}

export function currencyLabel(code: CurrencyCode): string {
  const c = CURRENCIES.find(c => c.code === code);
  return c ? `${c.code} — ${c.label}` : code;
}

// Single formatting entry point for every dollar amount shown in the app —
// swapping the currency in Settings only updates displays that go through
// this function, so it's the one place that has to stay correct.
export function formatMoney(amount: number, code: CurrencyCode): string {
  const symbol = currencySymbol(code);
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}${symbol}${Math.abs(rounded).toLocaleString()}`;
}

// Compact form for tight spaces (chart axis labels etc.) — "$1.2k" style.
export function formatMoneyCompact(amount: number, code: CurrencyCode): string {
  const symbol = currencySymbol(code);
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  if (abs >= 1000) return `${sign}${symbol}${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return `${sign}${symbol}${abs}`;
}
