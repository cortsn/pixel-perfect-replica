/** Beløb gemmes som øre (heltal) overalt og vises som DKK. */
const fmt = new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK' });
export const fmtDKK = (cents: number) => fmt.format(cents / 100);

/** "145", "145,50", "145.5" eller "-50" → øre. Ugyldigt (tomt, tekst, flere end 2 decimaler) → null. */
export function parseDKK(input: string): number | null {
  const s = input.trim().replace(/\s/g, '').replace(/kr\.?$/i, '');
  if (!/^-?\d+([.,]\d{1,2})?$/.test(s)) return null;
  const n = Math.round(Number(s.replace(',', '.')) * 100);
  return Number.isFinite(n) ? n : null;
}

/** Øre → tekst til et inputfelt ("145,50" eller "145"). */
export const centsToInput = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace('.', ','));
