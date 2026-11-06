// Money helpers. We keep amounts as numbers in major units (e.g. 245.50)
// and always round to cents before sending them anywhere.

export function roundToCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

// PayPal wants amounts as strings with exactly two decimals.
export function toPayPalValue(amount: number): string {
  return roundToCents(amount).toFixed(2);
}
