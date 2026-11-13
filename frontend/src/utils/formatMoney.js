/**
 * Format a money amount for staff-facing UI using the restaurant currency.
 * Null/undefined/empty become 0. Always shows 2 decimal places.
 */

let defaultCurrencyCode = 'PKR';

const CURRENCY_SYMBOLS = {
  PKR: 'Rs.',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AED: 'AED',
  SAR: 'SAR',
};

export function setDefaultCurrency(code) {
  if (code && typeof code === 'string') {
    defaultCurrencyCode = code.trim().toUpperCase() || 'PKR';
  }
}

export function getDefaultCurrency() {
  return defaultCurrencyCode;
}

export function money(value, currencyCode = defaultCurrencyCode) {
  const n = Number(value || 0);
  const code = (currencyCode || 'PKR').toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code] || `${code} `;
  const formatted = n.toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol} ${formatted}`.replace(/\s+/g, ' ').trim();
}
