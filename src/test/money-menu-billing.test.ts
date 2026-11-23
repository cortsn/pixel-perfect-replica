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

import { towelText } from '@/lib/cleaning';
import { cleaningNextAt, TOWEL_COOLDOWN_MS } from '@/lib/stay';
import { resolveNav } from '@/components/staff/core';
import { arrivalDue, departureDue, relativeTime, type GuestRow } from '@/components/staff/guests';

describe('rengøring, navigation og ankomster', () => {
  const t0 = Date.parse('2026-11-23T10:00:00Z');
  it('rengøring: værelseshåndklæder skiftes; alle ved afrejse', () => {
    expect(towelText({ wants_towels: true, towel_count: 2 })).toBe('Skift værelseshåndklæder');
    expect(towelText({ wants_towels: true, towel_count: 2, kind: 'checkout' })).toBe('Skift alle håndklæder');
    expect(towelText({ wants_towels: false, towel_count: 0 })).toBe('Ingen håndklædeskift');
  });
  it('rengøring kun 1 gang hver 12. time, men "ikke nået" kan bestilles igen', () => {
    const req = (status: string) => ({ status, created_at: new Date(t0).toISOString() });
    expect(cleaningNextAt(req('done'), t0 + 3600e3)).toBe(t0 + TOWEL_COOLDOWN_MS);
    expect(cleaningNextAt(req('done'), t0 + TOWEL_COOLDOWN_MS)).toBeNull();
    expect(cleaningNextAt(req('not_reached'), t0 + 1000)).toBeNull();
    expect(cleaningNextAt(null, t0)).toBeNull();
  });
  it('gamle adresser og ukendte sider ender det rigtige sted', () => {
    expect(resolveNav('roomservice')).toEqual({ section: 'orders', page: '' });
    expect(resolveNav('reservations')).toEqual({ section: 'guests', page: 'reservations' });
    expect(resolveNav('staff')).toEqual({ section: 'settings', page: 'staff' });
    expect(resolveNav('guests', 'arrivals')).toEqual({ section: 'guests', page: 'arrivals' });
    expect(resolveNav('guests', 'findes-ikke')).toEqual({ section: 'guests', page: 'overview' });
    expect(resolveNav('ukendt')).toEqual({ section: 'dashboard', page: '' });
  });
  it('ankomster og afrejser inden for 2 timer', () => {
    const g = (o: Partial<GuestRow>): GuestRow => ({ id: 'x', reference: 'R', room_number: '1', guest_name: 'G', guest_email: null, guests: 1, starts_at: new Date(t0).toISOString(), ends_at: new Date(t0 + 86400e3).toISOString(), checked_in_at: null, balance_cents: 0, in_house: false, ...o });
    expect(arrivalDue(g({ starts_at: new Date(t0 + 90 * 60e3).toISOString() }), 'soon', t0)).toBe(true);
    expect(arrivalDue(g({ starts_at: new Date(t0 + 150 * 60e3).toISOString() }), 'soon', t0)).toBe(false);
    expect(arrivalDue(g({ starts_at: new Date(t0 - 10 * 60e3).toISOString() }), 'soon', t0)).toBe(true); // skulle være tjekket ind
    expect(arrivalDue(g({ checked_in_at: new Date(t0).toISOString() }), 'all', t0)).toBe(false);
    expect(departureDue(g({ in_house: true, ends_at: new Date(t0 + 100 * 60e3).toISOString() }), 'soon', t0)).toBe(true);
    expect(departureDue(g({ in_house: true, ends_at: new Date(t0 + 5 * 3600e3).toISOString() }), 'soon', t0)).toBe(false);
    expect(departureDue(g({ overdue: true, ends_at: new Date(t0 - 3600e3).toISOString() }), 'soon', t0)).toBe(true);
    expect(departureDue(g({ in_house: false }), 'all', t0)).toBe(false);
  });
  it('tid til/siden', () => { expect(relativeTime(80 * 60e3)).toBe('om 1 t 20 min'); expect(relativeTime(-15 * 60e3)).toBe('for 15 min siden'); expect(relativeTime(10e3)).toBe('nu'); });
});
