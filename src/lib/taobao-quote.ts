export const MAX_QUOTE_VARIANTS = 12;
export const MAX_QUOTE_PHOTO_EDGE = 384;
export const MAX_QUOTE_PHOTO_URL = 36_000;
export const MIN_QUOTE_RATE = 10_000;
export const MAX_QUOTE_RATE = 500_000;

const decimal = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function quoteAmount(amount: number, currency: "RMB" | "USD") {
  return `${currency} ${decimal.format(amount / 100)}`;
}

export function quoteDecimal(text: string, digits: 2 | 4): number | null {
  const value = text.trim();
  if (!(digits === 2 ? /^\d{1,7}(?:[.,]\d{1,2})?$/ : /^\d{1,3}(?:[.,]\d{1,4})?$/).test(value)) return null;
  return Math.round(Number(value.replace(",", ".")) * 10 ** digits);
}

export function usdFromRmb(rmbCents: number, rate: number) {
  return Math.round(rmbCents * 10_000 / rate);
}
