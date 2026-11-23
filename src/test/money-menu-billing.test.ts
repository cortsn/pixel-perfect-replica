import { describe, expect, it, test } from 'vitest';
import { fmtDKK, parseDKK, centsToInput } from '@/lib/money';
import { addToCart, cartTotal, cartCount, lineKey, lineLabel, setLineQty, toOrderLines, unitPrice, type MenuItem } from '@/lib/menu';
import { billTotal, groupBill, type BillItem } from '@/lib/billing';

const beer: MenuItem = { id: 'b', name: 'Øl', description: '', price_cents: 5000, image_url: null, available_now: true, available_from: null, available_to: null,
  variants: [{ name: '33 cl', price_delta_cents: 0 }, { name: '50 cl', price_delta_cents: 1500 }], addons: [{ name: 'Nødder', price_cents: 2500 }] };
const soup: MenuItem = { id: 's', name: 'Suppe', description: '', price_cents: 9500, image_url: null, available_now: true, available_from: null, available_to: null, variants: [], addons: [] };

describe('money', () => {
  it('parses Danish and plain decimals to cents', () => {
    expect(parseDKK('145')).toBe(14500); expect(parseDKK('145,50')).toBe(14550); expect(parseDKK('145.5')).toBe(14550);
    expect(parseDKK('-50')).toBe(-5000); expect(parseDKK(' 12 kr')).toBe(1200);
  });
  it('rejects invalid amounts', () => { for (const s of ['', 'abc', '1,234', '1,', '--1']) expect(parseDKK(s)).toBeNull(); });
  it('formats DKK and round-trips input', () => { expect(fmtDKK(14550)).toMatch(/145,50/); expect(centsToInput(14500)).toBe('145'); expect(centsToInput(14550)).toBe('145,50'); expect(parseDKK(centsToInput(1205))).toBe(1205); });
});

describe('cart', () => {
  it('prices variants and add-ons', () => { expect(unitPrice(beer, '50 cl', ['Nødder'])).toBe(5000 + 1500 + 2500); expect(unitPrice(soup, null, [])).toBe(9500); });
  it('merges identical lines and keeps different choices apart', () => {
    let c = addToCart([], beer, '33 cl', [], 1); c = addToCart(c, beer, '33 cl', [], 2); c = addToCart(c, beer, '50 cl', ['Nødder'], 1);
    expect(c).toHaveLength(2); expect(cartCount(c)).toBe(4); expect(cartTotal(c)).toBe(3 * 5000 + 9000);
  });
  it('caps quantity at 10 and removes at 0', () => {
    let c = addToCart([], soup, null, [], 9); c = addToCart(c, soup, null, [], 5); expect(c[0]!.qty).toBe(10);
    expect(setLineQty(c, c[0]!.key, 0)).toHaveLength(0);
  });
  it('builds order lines and labels', () => {
    const c = addToCart([], beer, '50 cl', ['Nødder'], 2);
    expect(toOrderLines(c)).toEqual([{ item_id: 'b', qty: 2, variant: '50 cl', addons: ['Nødder'] }]); expect(lineLabel(c[0]!)).toBe('Øl (50 cl) + Nødder');
    expect(lineKey('b', null, ['B', 'A'])).toBe(lineKey('b', null, ['A', 'B']));
  });
});

describe('bill', () => {
  const it = (o: Partial<BillItem>): BillItem => ({ id: Math.random().toString(), category: 'minibar', description: 'x', quantity: 1, unit_price_cents: 100, source: 'staff', order_id: null, paid: false, voided_at: null, void_reason: null, created_by: '', created_at: '', ...o });
  test('ignores voided lines and supports credits', () => {
    expect(billTotal([it({ quantity: 2, unit_price_cents: 3500 }), it({ unit_price_cents: -5000 }), it({ unit_price_cents: 99999, voided_at: 'x' })])).toBe(2000);
  });
  test('groups by category in a fixed order with subtotals', () => {
    const g = groupBill([it({ category: 'minibar', unit_price_cents: 300 }), it({ category: 'accommodation', quantity: 2, unit_price_cents: 1000 }), it({ category: 'minibar', unit_price_cents: 200 })]);
    expect(g.map(x => x.value)).toEqual(['accommodation', 'minibar']); expect(g[1]!.subtotal).toBe(500); expect(g[0]!.subtotal).toBe(2000);
  });
});
