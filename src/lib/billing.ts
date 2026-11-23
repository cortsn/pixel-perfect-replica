/** Gæsteregning: poster, kategorier og saldo. HotelPilot håndterer ikke betaling; personalet registrerer betaling fra hotellets eget system. */
export type BillCategory = 'room_service' | 'restaurant_bar' | 'minibar' | 'service' | 'accommodation' | 'other';
export const BILL_CATEGORIES: { value: BillCategory; label: string }[] = [
  { value: 'accommodation', label: 'Overnatning' },
  { value: 'room_service', label: 'Roomservice' },
  { value: 'restaurant_bar', label: 'Restaurant og bar' },
  { value: 'minibar', label: 'Minibar' },
  { value: 'service', label: 'Andre services' },
  { value: 'other', label: 'Andet' },
];
export const categoryLabel = (c: string) => BILL_CATEGORIES.find(x => x.value === c)?.label ?? c;

export type BillItem = {
  id: string; category: BillCategory; description: string; quantity: number; unit_price_cents: number; source: 'staff' | 'order' | 'system';
  order_id: string | null; paid: boolean; voided_at: string | null; void_reason: string | null; created_by: string; created_at: string;
};
export type BillBooking = {
  id: string; reference: string; room_number: string; guest_name: string; guest_email?: string | null; guests: number; starts_at: string; ends_at: string;
  checked_in_at: string | null; checked_out_at: string | null; active: boolean; rate_cents: number;
};
export type Bill = { booking: BillBooking; items: BillItem[]; total_cents: number; paid_in_app_cents: number; due_cents: number };

export const lineTotal = (i: Pick<BillItem, 'quantity' | 'unit_price_cents'>) => i.quantity * i.unit_price_cents;
/** Annullerede poster tæller ikke med. */
export const billTotal = (items: Pick<BillItem, 'quantity' | 'unit_price_cents' | 'voided_at'>[]) => items.filter(i => !i.voided_at).reduce((s, i) => s + lineTotal(i), 0);

/** Poster grupperet pr. kategori i fast rækkefølge, med deltotal. Tomme kategorier udelades. */
export function groupBill<T extends BillItem>(items: T[]) {
  return BILL_CATEGORIES.map(c => {
    const list = items.filter(i => i.category === c.value);
    return { ...c, items: list, subtotal: billTotal(list) };
  }).filter(g => g.items.length > 0);
}

export const PAYMENT_METHODS = ['Betalingsterminal', 'Kontant', 'MobilePay', 'Faktura / firma', 'Andet'] as const;
