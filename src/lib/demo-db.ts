/**
 * Demo-databasen: en lille database i browseren, som både gæste- og personalesiden i /demo bruger,
 * så en bestilling fra gæsten dukker op hos personalet, regningen hænger sammen med checkout osv.
 * Reglerne spejler SQL-funktionerne i drizzle/migrations/0010_billing_menu_checkout.sql.
 * Intet sendes til en server, og alt nulstilles, når siden genindlæses.
 */
import type { GuestMenu } from '@/lib/menu';

type Dict = Record<string, unknown>;
export type DemoRoom = { number: string; floor: number; capacity: number; housekeeping_status: 'occupied' | 'needs_cleaning' | 'cleaning' | 'clean'; rate_cents: number };
export type DemoBooking = {
  id: string; reference: string; room_number: string; guest_name: string; guest_email: string | null; guests: number; starts_at: string; ends_at: string;
  checked_in_at: string | null; checked_out_at: string | null; active: boolean; notice_kind: 'start' | 'end' | 'both' | null; notice_at: string | null;
  breakfast_choice: 'hotel' | 'out' | null; lunch_choice: 'hotel' | 'out' | null; dinner_choice: 'hotel' | 'out' | null;
};
type Variant = { name: string; price_delta_cents: number };
type Addon = { name: string; price_cents: number };
type Cat = { id: string; name: string; sort: number; active: boolean };
type Item = { id: string; category_id: string; name: string; description: string; price_cents: number; image_url: string | null; active: boolean; sort: number; available_from: string | null; available_to: string | null; variants: Variant[]; addons: Addon[] };
type OrderLine = { item_id: string; name: string; qty: number; unit_cents: number };
export type DemoOrder = { id: string; room_number: string; booking_id: string | null; type: 'towels' | 'room_service'; details: string; status: string; cancelled: boolean; quantity: number; items: OrderLine[]; total_cents: number; paid: boolean; reject_reason: string; created_at: string; updated_at: string };
type Bill = { id: string; booking_id: string; room_number: string; category: string; description: string; quantity: number; unit_price_cents: number; source: 'staff' | 'order' | 'system'; order_id: string | null; order_line: number | null; paid: boolean; voided_at: string | null; void_reason: string | null; created_by: string; created_at: string };
type Cleaning = { id: string; booking_id: string; room_number: string; wants_towels: boolean; towel_count: number; away_from: string | null; away_until: string | null; status: 'requested' | 'in_progress' | 'done' | 'not_reached'; is_repeat: boolean; kind: 'guest' | 'checkout'; created_at: string; updated_at: string };
type Checkout = { id: string; booking_id: string; reference: string; room_number: string; guest_name: string; guests: number; starts_at: string; ends_at: string; total_cents: number; paid_in_app_cents: number; due_cents: number; payment_method: string; note: string; items: Bill[]; checked_out_by: string; created_at: string };
type Member = { id: string; name: string; role: string; pin: string; active: boolean; created_at: string };

export const DEMO_PIN = 'demo';
/** Gæsten i demoen: bor i værelse 101. */
export const DEMO_GUEST_ROOM = '101';
const WHO = 'Demo-leder';
const CATS = ['room_service', 'restaurant_bar', 'minibar', 'service', 'accommodation', 'other'];

const iso = (ms: number) => new Date(ms).toISOString();
const ts = (s: string) => Date.parse(s);
let seq = 0;
const uid = (p = 'd') => `${p}${++seq}-${Math.random().toString(36).slice(2, 7)}`;
const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const hhmm = (s: string | null | undefined) => (s ? s.slice(0, 5) : null);
const minutesNow = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };
/** Er klokken nu inden for tidsrummet? Understøtter hen over midnat. Ens tider = hele døgnet. */
export function inHours(from: string | null, to: string | null): boolean {
  if (!from || !to || from === to) return true;
  const t = minutesNow(), a = toMin(from), b = toMin(to);
  return a < b ? t >= a && t < b : t >= a || t < b;
}
const err = (m: string): never => { throw new Error(m); };
const sum = (xs: Bill[]) => xs.reduce((s, i) => s + i.quantity * i.unit_price_cents, 0);

type State = {
  rooms: DemoRoom[]; bookings: DemoBooking[]; orders: DemoOrder[]; bills: Bill[]; cleaning: Cleaning[]; checkouts: Checkout[];
  cats: Cat[]; items: Item[]; settings: { enabled: boolean; opens_at: string; closes_at: string };
  feedback: { id: string; booking_id: string; room_number: string; rating: number; comment: string; created_at: string }[];
  emails: { id: string; booking_id: string; recipient: string; subject: string; status: string; created_at: string }[];
  members: Member[]; wifi: { ssid: string; password: string };
};

function seed(): State {
  const now = Date.now(), H = 3600e3, M = 60e3;
  const rooms: DemoRoom[] = [
    ['101', 1, 2, 'clean'], ['102', 1, 2, 'clean'], ['103', 1, 3, 'needs_cleaning'], ['104', 1, 2, 'clean'],
    ['201', 2, 2, 'occupied'], ['202', 2, 4, 'cleaning'], ['203', 2, 2, 'occupied'], ['204', 2, 2, 'clean'],
    ['301', 3, 2, 'needs_cleaning'], ['302', 3, 2, 'occupied'], ['303', 3, 3, 'clean'], ['304', 3, 4, 'occupied'],
  ].map(([number, floor, capacity, housekeeping_status]) => ({ number, floor, capacity, housekeeping_status, rate_cents: 129500 }) as DemoRoom);
  const bk = (ref: string, room: string, name: string, guests: number, start: number, end: number, checkedIn: boolean, meals: Partial<DemoBooking> = {}): DemoBooking => ({
    id: `b-${ref}`, reference: ref, room_number: room, guest_name: name, guest_email: `${name.split(' ')[0]!.toLowerCase()}@example.com`, guests, starts_at: iso(start), ends_at: iso(end),
    checked_in_at: checkedIn ? iso(start + 20 * M) : null, checked_out_at: null, active: true, notice_kind: null, notice_at: null, breakfast_choice: null, lunch_choice: null, dinner_choice: null, ...meals,
  });
  const bookings = [
    // Anna (demo-gæsten) er ankommet, men har endnu ikke tjekket ind.
    bk('HP-1001', '101', 'Anna Nielsen', 2, now - 5 * M, now + 26 * H, false),
    bk('HP-2001', '201', 'Mads Jensen', 2, now - 20 * H, now + 20 * H, true, { breakfast_choice: 'hotel', dinner_choice: 'hotel' }),
    bk('HP-2003', '203', 'Maria Holm', 2, now - 5 * H, now + 20 * H, true, { breakfast_choice: 'hotel', lunch_choice: 'out', dinner_choice: 'hotel' }),
    bk('HP-3002', '302', 'Emma Nielsen', 2, now - 30 * H, now + 100 * M, true, { breakfast_choice: 'out' }),
    bk('HP-3004', '304', 'Familien Holm', 4, now - 8 * H, now + 40 * H, true, { dinner_choice: 'hotel' }),
    bk('HP-3003', '303', 'Jens Aaby', 1, now + 95 * M, now + 50 * H, false),
  ];
  const cats: Cat[] = [{ id: 'c-mad', name: 'Mad', sort: 1, active: true }, { id: 'c-snack', name: 'Snacks', sort: 2, active: true }, { id: 'c-drik', name: 'Drikke', sort: 3, active: true }];
  const it = (id: string, category_id: string, name: string, description: string, price_cents: number, sort: number, extra: Partial<Item> = {}): Item =>
    ({ id, category_id, name, description, price_cents, image_url: null, active: true, sort, available_from: null, available_to: null, variants: [], addons: [], ...extra });
  const items: Item[] = [
    it('i-club', 'c-mad', 'Club sandwich', 'Kylling, bacon, salat og tomat', 14500, 1, { addons: [{ name: 'Ekstra bacon', price_cents: 1500 }] }),
    it('i-caesar', 'c-mad', 'Caesar salat', 'Romaine, parmesan og croutoner', 13500, 2),
    it('i-suppe', 'c-mad', 'Dagens suppe', 'Serveres med brød', 9500, 3),
    it('i-pommes', 'c-snack', 'Pommes frites', 'Med mayo eller ketchup', 6500, 1),
    it('i-vin', 'c-drik', 'Flaske rødvin', '75 cl, husets vin', 29500, 1),
    it('i-kaffe', 'c-drik', 'Kaffe & croissant', 'Friskbrygget kaffe', 6500, 2),
    it('i-ol', 'c-drik', 'Fadøl', 'Lokalt bryg', 5500, 3, { variants: [{ name: '33 cl', price_delta_cents: 0 }, { name: '50 cl', price_delta_cents: 1500 }] }),
  ];
  const line = (item_id: string, name: string, qty: number, unit_cents: number): OrderLine => ({ item_id, name, qty, unit_cents });
  const ord = (o: Partial<DemoOrder> & Pick<DemoOrder, 'room_number' | 'booking_id' | 'type' | 'details'>, ago: number): DemoOrder => ({
    id: uid('o'), status: 'pending', cancelled: false, quantity: 1, items: [], total_cents: 0, paid: false, reject_reason: '', created_at: iso(now - ago * M), updated_at: iso(now - ago * M), ...o,
  });
  const orders: DemoOrder[] = [
    ord({ room_number: '203', booking_id: 'b-HP-2003', type: 'towels', details: '2 poolhåndklæder til bytte', quantity: 2 }, 3),
    ord({ room_number: '201', booking_id: 'b-HP-2001', type: 'room_service', details: '1× Club sandwich', items: [line('i-club', 'Club sandwich', 1, 14500)], total_cents: 14500 }, 14),
    ord({ room_number: '302', booking_id: 'b-HP-3002', type: 'room_service', details: '1× Flaske rødvin', status: 'in_progress', items: [line('i-vin', 'Flaske rødvin', 1, 29500)], total_cents: 29500 }, 8),
    ord({ room_number: '304', booking_id: 'b-HP-3004', type: 'room_service', details: '2× Kaffe & croissant', status: 'done', items: [line('i-kaffe', 'Kaffe & croissant', 2, 6500)], total_cents: 13000 }, 90),
  ];
  const bills: Bill[] = [
    { id: uid('bi'), booking_id: 'b-HP-3004', room_number: '304', category: 'room_service', description: 'Kaffe & croissant', quantity: 2, unit_price_cents: 6500, source: 'order', order_id: orders[3]!.id, order_line: 1, paid: false, voided_at: null, void_reason: null, created_by: WHO, created_at: iso(now - 80 * M) },
    { id: uid('bi'), booking_id: 'b-HP-2003', room_number: '203', category: 'minibar', description: 'Cola', quantity: 2, unit_price_cents: 3500, source: 'staff', order_id: null, order_line: null, paid: false, voided_at: null, void_reason: null, created_by: WHO, created_at: iso(now - 40 * M) },
  ];
  const cleaning: Cleaning[] = [
    { id: uid('c'), booking_id: 'b-HP-2003', room_number: '203', wants_towels: true, towel_count: 2, away_from: iso(now - 60 * M), away_until: iso(now + 40 * M), status: 'requested', is_repeat: false, kind: 'guest', created_at: iso(now - 30 * M), updated_at: iso(now - 30 * M) },
    { id: uid('c'), booking_id: 'b-HP-3002', room_number: '302', wants_towels: false, towel_count: 0, away_from: null, away_until: null, status: 'requested', is_repeat: true, kind: 'guest', created_at: iso(now - 10 * M), updated_at: iso(now - 10 * M) },
  ];
  const feedback = [
    { id: uid('f'), booking_id: 'b-HP-2001', room_number: '201', rating: 5, comment: 'Dejligt ophold, nem service.', created_at: iso(now - 26 * H) },
    { id: uid('f'), booking_id: 'b-HP-3002', room_number: '302', rating: 4, comment: 'Lidt ventetid på room service.', created_at: iso(now - 50 * H) },
    { id: uid('f'), booking_id: 'b-HP-2003', room_number: '203', rating: 5, comment: 'Fantastisk morgenmad og søde medarbejdere.', created_at: iso(now - 74 * H) },
    { id: uid('f'), booking_id: 'b-HP-3004', room_number: '304', rating: 3, comment: '', created_at: iso(now - 98 * H) },
  ];
  return { rooms, bookings, orders, bills, cleaning, checkouts: [], cats, items, settings: { enabled: true, opens_at: '00:00', closes_at: '00:00' }, feedback, emails: [], members: [], wifi: { ssid: 'HotelPilot_Guest', password: 'Nordlys2026' } };
}

let S: State = seed();
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach(l => l()); };

const bookingOf = (id: string) => S.bookings.find(b => b.id === id) ?? err('BOOKING_NOT_FOUND');
const billOf = (id: string) => S.bills.filter(b => b.booking_id === id);
const liveItems = (id: string) => billOf(id).filter(b => !b.voided_at);
const statusOf = (o: DemoOrder) => (o.cancelled ? 'cancelled' : o.status);
const isCurrent = (b: DemoBooking, now = Date.now()) => b.active && !b.checked_out_at && ts(b.starts_at) <= now && ts(b.ends_at) > now;

function internalBill(id: string) {
  const b = bookingOf(id), r = S.rooms.find(x => x.number === b.room_number)!;
  const items = billOf(id), live = items.filter(i => !i.voided_at);
  return {
    booking: { id: b.id, reference: b.reference, room_number: b.room_number, guest_name: b.guest_name, guest_email: b.guest_email, guests: b.guests, starts_at: b.starts_at, ends_at: b.ends_at, checked_in_at: b.checked_in_at, checked_out_at: b.checked_out_at, active: b.active, rate_cents: r.rate_cents },
    items: [...items].sort((a, c) => ts(a.created_at) - ts(c.created_at)),
    total_cents: sum(live), paid_in_app_cents: sum(live.filter(i => i.paid)), due_cents: sum(live.filter(i => !i.paid)),
  };
}
function billAdd(booking: string, category: string, description: string, qty: number, unit: number, source: Bill['source'] = 'staff', extra: Partial<Bill> = {}) {
  const b = bookingOf(booking);
  if (b.checked_out_at) err('BILL_CLOSED');
  if (!CATS.includes(category)) err('INVALID_CATEGORY');
  if (!description || !description.trim()) err('INVALID_NAME');
  if (!Number.isInteger(qty) || qty < 1 || qty > 999) err('INVALID_QTY');
  if (!Number.isInteger(unit) || Math.abs(unit) > 10000000) err('INVALID_PRICE');
  const row: Bill = { id: uid('bi'), booking_id: b.id, room_number: b.room_number, category, description: description.trim().slice(0, 200), quantity: qty, unit_price_cents: unit, source, order_id: null, order_line: null, paid: false, voided_at: null, void_reason: null, created_by: WHO, created_at: iso(Date.now()), ...extra };
  S.bills.push(row);
  return row.id;
}
const openOrderStatuses = ['pending', 'accepted', 'in_progress', 'ready'];

function guestOrder(booking: string, type: 'towels' | 'room_service', details: string, extra: Partial<DemoOrder> = {}) {
  const b = bookingOf(booking), now = iso(Date.now());
  const o: DemoOrder = { id: uid('o'), room_number: b.room_number, booking_id: b.id, type, details, status: 'pending', cancelled: false, quantity: 1, items: [], total_cents: 0, paid: false, reject_reason: '', created_at: now, updated_at: now, ...extra };
  S.orders.push(o);
  return o.id;
}

const H: Record<string, (a: Dict) => unknown> = {
  staff_who: () => ({ name: WHO, role: 'manager' }),

  staff_dashboard: () => {
    const now = Date.now(), today = dayKey(now), cur = S.bookings.filter(b => isCurrent(b, now));
    const live = S.bills.filter(b => !b.voided_at);
    const open = new Set(S.bookings.filter(b => b.active && !b.checked_out_at).map(b => b.id));
    return {
      arrivals: S.bookings.filter(b => b.active && !b.checked_out_at && dayKey(ts(b.starts_at)) === today).sort((a, c) => ts(a.starts_at) - ts(c.starts_at)).map(b => ({ id: b.id, room_number: b.room_number, guest_name: b.guest_name, guests: b.guests, starts_at: b.starts_at, checked_in_at: b.checked_in_at })),
      departures: S.bookings.filter(b => b.active && ts(b.starts_at) <= now && ((!b.checked_out_at && dayKey(ts(b.ends_at)) <= today && ts(b.ends_at) > now - 7 * 86400000) || (b.checked_out_at && dayKey(ts(b.checked_out_at)) === today))).sort((a, c) => ts(a.ends_at) - ts(c.ends_at)).map(b => ({ id: b.id, room_number: b.room_number, guest_name: b.guest_name, guests: b.guests, ends_at: b.ends_at, checked_out_at: b.checked_out_at })),
      rooms_total: S.rooms.length, occupied: new Set(cur.map(b => b.room_number)).size, free: Math.max(S.rooms.length - new Set(cur.map(b => b.room_number)).size, 0),
      rooms_to_clean: S.rooms.filter(r => ['needs_cleaning', 'cleaning'].includes(r.housekeeping_status)).length,
      open_tasks: S.cleaning.filter(c => ['requested', 'in_progress'].includes(c.status)).length + S.orders.filter(o => o.type === 'towels' && !o.cancelled && openOrderStatuses.includes(o.status)).length,
      new_orders: S.orders.filter(o => o.type === 'room_service' && o.status === 'pending' && !o.cancelled).length,
      open_orders: S.orders.filter(o => o.type === 'room_service' && openOrderStatuses.includes(o.status) && !o.cancelled).length,
      revenue_today_cents: sum(live.filter(i => dayKey(ts(i.created_at)) === today)),
      unsettled_cents: sum(live.filter(i => !i.paid && open.has(i.booking_id))),
    };
  },

  staff_guests: () => S.bookings.filter(b => b.active && !b.checked_out_at && ts(b.ends_at) > Date.now() - 7 * 86400000).sort((a, c) => ts(a.starts_at) - ts(c.starts_at))
    .map(b => ({ id: b.id, reference: b.reference, room_number: b.room_number, guest_name: b.guest_name, guest_email: b.guest_email, guests: b.guests, starts_at: b.starts_at, ends_at: b.ends_at, checked_in_at: b.checked_in_at, balance_cents: sum(liveItems(b.id)), in_house: ts(b.starts_at) <= Date.now() && ts(b.ends_at) > Date.now(), overdue: ts(b.starts_at) <= Date.now() && ts(b.ends_at) <= Date.now() })),

  staff_rooms: () => S.rooms.map(r => {
    const b = S.bookings.find(x => x.room_number === r.number && isCurrent(x));
    const ov = S.bookings.find(x => x.room_number === r.number && x.active && !x.checked_out_at && ts(x.starts_at) <= Date.now() && ts(x.ends_at) <= Date.now() && ts(x.ends_at) > Date.now() - 7 * 86400000);
    return { ...r, guest_name: b?.guest_name ?? null, booking_id: b?.id ?? null, ends_at: b?.ends_at ?? null, guests: b?.guests ?? null, reference: b?.reference ?? null, overdue_booking_id: ov?.id ?? null, overdue_guest: ov?.guest_name ?? null };
  }),
  staff_set_room_status: a => { const r = S.rooms.find(x => x.number === a['_room']) ?? err('ROOM_NOT_FOUND'); if (!['occupied', 'needs_cleaning', 'cleaning', 'clean'].includes(String(a['_status']))) err('INVALID_STATUS'); r.housekeeping_status = a['_status'] as DemoRoom['housekeeping_status']; return null; },
  staff_room_rate_set: a => { const c = Number(a['_cents']); if (!Number.isInteger(c) || c < 0) err('INVALID_PRICE'); (S.rooms.find(x => x.number === a['_room']) ?? err('ROOM_NOT_FOUND')).rate_cents = c; return null; },

  staff_orders: a => [...S.orders].sort((x, y) => ts(y.created_at) - ts(x.created_at)).slice(0, Math.min(Math.max(Number(a['_limit'] ?? 100), 1), 500))
    .map(o => ({ id: o.id, room_number: o.room_number, type: o.type, details: o.details, status: statusOf(o), created_at: o.created_at, updated_at: o.updated_at, quantity: o.quantity, items: o.items, total_cents: o.total_cents, paid: o.paid, reject_reason: o.reject_reason, guest_name: S.bookings.find(b => b.id === o.booking_id)?.guest_name ?? null })),
  staff_set_order_status: a => {
    const o = S.orders.find(x => x.id === a['_order']) ?? err('NOT_FOUND'), st = String(a['_status']);
    if (!['pending', 'accepted', 'in_progress', 'ready', 'done', 'rejected'].includes(st)) err('INVALID_STATUS');
    if (o.cancelled || ['cancelled', 'done', 'rejected'].includes(o.status)) err('ORDER_CLOSED');
    o.status = st; o.updated_at = iso(Date.now());
    if (st === 'rejected') o.reject_reason = String(a['_reason'] ?? '').slice(0, 200);
    if (st === 'done' && o.type === 'room_service' && o.booking_id && !o.paid) {
      o.items.forEach((l, idx) => {
        if (S.bills.some(b => b.order_id === o.id && b.order_line === idx + 1)) return;
        billAdd(o.booking_id!, 'room_service', l.name, l.qty, l.unit_cents, 'order', { order_id: o.id, order_line: idx + 1 });
      });
    }
    return null;
  },

  staff_check_in: a => {
    const b = bookingOf(String(a['_booking']));
    if (!b.active) err('BOOKING_NOT_FOUND');
    if (b.checked_out_at || ts(b.ends_at) <= Date.now()) err('STAY_ENDED');
    if (b.checked_in_at) err('ALREADY_CHECKED_IN');
    const now = Date.now();
    if (ts(b.starts_at) > now) {
      if (S.bookings.some(o => o.id !== b.id && o.room_number === b.room_number && o.active && !o.checked_out_at && ts(o.starts_at) < ts(b.ends_at) && ts(o.ends_at) > now)) err('ROOM_BUSY');
      b.starts_at = iso(now); b.notice_kind = b.notice_kind === 'end' || b.notice_kind === 'both' ? 'both' : 'start'; b.notice_at = iso(now);
    }
    b.checked_in_at = iso(now);
    return null;
  },
  staff_feedback: a => {
    const q = String(a['_q'] ?? '').trim().toLowerCase(), rating = a['_rating'] == null ? null : Number(a['_rating']);
    const book = (id: string) => S.bookings.find(b => b.id === id);
    const items = [...S.feedback].sort((x, y) => ts(y.created_at) - ts(x.created_at))
      .map(f => ({ id: f.id, room_number: f.room_number, rating: f.rating, comment: f.comment, created_at: f.created_at, guest_name: book(f.booking_id)?.guest_name ?? null, reference: book(f.booking_id)?.reference ?? null }))
      .filter(f => (rating === null || f.rating === rating) && `${f.guest_name ?? ''} ${f.room_number} ${f.comment} ${f.reference ?? ''}`.toLowerCase().includes(q));
    const all = S.feedback;
    return { count: all.length, avg: all.length ? Math.round((all.reduce((s, f) => s + f.rating, 0) / all.length) * 10) / 10 : null,
      distribution: [5, 4, 3, 2, 1].map(r => ({ rating: r, n: all.filter(f => f.rating === r).length })), items };
  },
  staff_bill: a => internalBill(String(a['_booking'])),
  staff_bill_add: a => billAdd(String(a['_booking']), String(a['_category']), String(a['_description']), Number(a['_qty']), Number(a['_unit_cents'])),
  staff_bill_edit: a => {
    const it = S.bills.find(b => b.id === a['_item']) ?? err('NOT_FOUND');
    if (bookingOf(it.booking_id).checked_out_at) err('BILL_CLOSED');
    if (it.voided_at) err('ITEM_VOIDED');
    const qty = Number(a['_qty']), unit = Number(a['_unit_cents']);
    if (!CATS.includes(String(a['_category']))) err('INVALID_CATEGORY');
    if (!String(a['_description'] ?? '').trim()) err('INVALID_NAME');
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) err('INVALID_QTY');
    if (!Number.isInteger(unit) || Math.abs(unit) > 10000000) err('INVALID_PRICE');
    Object.assign(it, { category: a['_category'], description: String(a['_description']).trim().slice(0, 200), quantity: qty, unit_price_cents: unit });
    return null;
  },
  staff_bill_void: a => {
    const it = S.bills.find(b => b.id === a['_item']) ?? err('NOT_FOUND');
    if (bookingOf(it.booking_id).checked_out_at) err('BILL_CLOSED');
    if (!it.voided_at) { it.voided_at = iso(Date.now()); it.void_reason = String(a['_reason'] ?? '').slice(0, 200); }
    return null;
  },
  staff_bill_add_accommodation: a => {
    const b = bookingOf(String(a['_booking'])), r = S.rooms.find(x => x.number === b.room_number)!;
    if (r.rate_cents <= 0) err('NO_ROOM_RATE');
    if (liveItems(b.id).some(i => i.category === 'accommodation')) err('ALREADY_ADDED');
    const nights = Math.max(1, Math.round((new Date(dayKey(ts(b.ends_at))).getTime() - new Date(dayKey(ts(b.starts_at))).getTime()) / 86400000));
    return billAdd(b.id, 'accommodation', `Overnatning, værelse ${b.room_number} (${nights} ${nights === 1 ? 'nat' : 'nætter'})`, nights, r.rate_cents);
  },

  staff_checkout: a => {
    const b = bookingOf(String(a['_booking']));
    if (!b.active) err('BOOKING_NOT_FOUND');
    if (b.checked_out_at) err('ALREADY_CHECKED_OUT');
    if (Date.now() <= ts(b.starts_at)) err('STAY_NOT_STARTED');
    if (S.orders.some(o => o.booking_id === b.id && o.type === 'room_service' && !o.cancelled && openOrderStatuses.includes(o.status))) err('OPEN_ORDERS');
    const bill = internalBill(b.id), method = String(a['_method'] ?? '').trim();
    if (bill.due_cents > 0 && !method) err('PAYMENT_REQUIRED');
    const now = Date.now(), id = uid('co');
    S.checkouts.push({ id, booking_id: b.id, reference: b.reference, room_number: b.room_number, guest_name: b.guest_name, guests: b.guests, starts_at: b.starts_at, ends_at: iso(Math.min(ts(b.ends_at), now)), total_cents: bill.total_cents, paid_in_app_cents: bill.paid_in_app_cents, due_cents: bill.due_cents, payment_method: method.slice(0, 80), note: String(a['_note'] ?? '').slice(0, 500), items: bill.items, checked_out_by: WHO, created_at: iso(now) });
    b.checked_out_at = iso(now); b.ends_at = iso(Math.min(ts(b.ends_at), now));
    const room = S.rooms.find(r => r.number === b.room_number)!; room.housekeeping_status = 'needs_cleaning';
    const open = S.cleaning.filter(c => c.booking_id === b.id && ['requested', 'in_progress'].includes(c.status));
    if (open.length) open.forEach(c => Object.assign(c, { kind: 'checkout', wants_towels: true, towel_count: b.guests, updated_at: iso(now) }));
    else S.cleaning.push({ id: uid('c'), booking_id: b.id, room_number: b.room_number, wants_towels: true, towel_count: b.guests, away_from: null, away_until: null, status: 'requested', is_repeat: false, kind: 'checkout', created_at: iso(now), updated_at: iso(now) });
    return id;
  },

  staff_cleaning: () => ({
    requests: [...S.cleaning].filter(c => ['requested', 'in_progress'].includes(c.status) || ts(c.updated_at) > Date.now() - 12 * 3600e3).sort((x, y) => ts(y.created_at) - ts(x.created_at))
      .map(c => ({ id: c.id, room_number: c.room_number, guest_name: bookingOf(c.booking_id).guest_name, wants_towels: c.wants_towels, towel_count: c.towel_count, away_from: c.away_from, away_until: c.away_until, status: c.status, is_repeat: c.is_repeat, kind: c.kind, created_at: c.created_at, updated_at: c.updated_at })),
  }),
  staff_set_cleaning: a => {
    const c = S.cleaning.find(x => x.id === a['_request']) ?? err('REQUEST_CLOSED'), st = String(a['_status']);
    if (!['in_progress', 'done', 'not_reached'].includes(st)) err('INVALID_STATUS');
    if (c.kind === 'checkout' && st === 'not_reached') err('INVALID_STATUS');
    if (!['requested', 'in_progress'].includes(c.status)) err('REQUEST_CLOSED');
    c.status = st as Cleaning['status']; c.updated_at = iso(Date.now());
    S.rooms.find(r => r.number === c.room_number)!.housekeeping_status = st === 'in_progress' ? 'cleaning' : st === 'done' ? 'clean' : 'occupied';
    return null;
  },

  staff_history: a => {
    const q = String(a['_q'] ?? '').trim().toLowerCase(), from = a['_from'] ? String(a['_from']) : '0000-00-00', to = a['_to'] ? String(a['_to']) : '9999-99-99';
    const inRange = (s: string) => { const d = dayKey(ts(s)); return d >= from && d <= to; };
    const guest = (id: string | null) => S.bookings.find(b => b.id === id);
    const newest = <T extends { created_at: string }>(xs: T[]) => [...xs].sort((x, y) => ts(y.created_at) - ts(x.created_at)).slice(0, 300);
    if (a['_kind'] === 'checkouts') return newest(S.checkouts.filter(c => `${c.guest_name} ${c.room_number} ${c.reference}`.toLowerCase().includes(q) && inRange(c.created_at)));
    if (a['_kind'] === 'sales') return newest(S.bills.filter(i => { const b = guest(i.booking_id)!; return `${b.guest_name} ${i.room_number} ${b.reference} ${i.description}`.toLowerCase().includes(q) && inRange(i.created_at); }))
      .map(i => ({ ...i, guest_name: guest(i.booking_id)!.guest_name, reference: guest(i.booking_id)!.reference }));
    if (a['_kind'] === 'orders') return newest(S.orders.filter(o => { const b = guest(o.booking_id); return `${b?.guest_name ?? ''} ${o.room_number} ${b?.reference ?? ''} ${o.details}`.toLowerCase().includes(q) && inRange(o.created_at); }))
      .map(o => ({ id: o.id, room_number: o.room_number, type: o.type, details: o.details, status: statusOf(o), total_cents: o.total_cents, created_at: o.created_at, updated_at: o.updated_at, reject_reason: o.reject_reason, guest_name: guest(o.booking_id)?.guest_name ?? null, reference: guest(o.booking_id)?.reference ?? null }));
    return err('INVALID_KIND');
  },

  staff_menu: () => ({
    settings: { ...S.settings },
    categories: [...S.cats].sort((x, y) => x.sort - y.sort),
    items: [...S.items].sort((x, y) => x.sort - y.sort),
  }),
  staff_menu_category_save: a => {
    const name = String(a['_name'] ?? '').trim(); if (!name) err('INVALID_NAME');
    if (!a['_id']) { const c: Cat = { id: uid('cat'), name: name.slice(0, 60), sort: Number(a['_sort'] ?? 0), active: a['_active'] !== false }; S.cats.push(c); return c.id; }
    const c = S.cats.find(x => x.id === a['_id']) ?? err('NOT_FOUND');
    c.name = name.slice(0, 60); if (a['_sort'] !== null && a['_sort'] !== undefined) c.sort = Number(a['_sort']); if (typeof a['_active'] === 'boolean') c.active = a['_active'];
    return c.id;
  },
  staff_menu_category_delete: a => { S.cats = S.cats.filter(c => c.id !== a['_id']); S.items = S.items.filter(i => i.category_id !== a['_id']); return null; },
  staff_menu_item_save: a => {
    const x = (a['_item'] ?? {}) as Dict, price = Number(x['price_cents']), variants = (x['variants'] ?? []) as Dict[], addons = (x['addons'] ?? []) as Dict[];
    if (!String(x['name'] ?? '').trim()) err('INVALID_NAME');
    if (!Number.isInteger(price) || price < 0) err('INVALID_PRICE');
    const from = x['available_from'] ? String(x['available_from']) : null, to = x['available_to'] ? String(x['available_to']) : null;
    if ((from === null) !== (to === null)) err('INVALID_HOURS');
    if (variants.some(v => !String(v['name'] ?? '').trim() || v['price_delta_cents'] == null) || addons.some(v => !String(v['name'] ?? '').trim() || v['price_cents'] == null || Number(v['price_cents']) < 0)) err('INVALID_OPTIONS');
    const row = { category_id: String(x['category_id']), name: String(x['name']).trim().slice(0, 100), description: String(x['description'] ?? '').slice(0, 500), price_cents: price, image_url: String(x['image_url'] ?? '').trim() || null, available_from: hhmm(from), available_to: hhmm(to),
      variants: variants.map(v => ({ name: String(v['name']).trim(), price_delta_cents: Number(v['price_delta_cents']) })), addons: addons.map(v => ({ name: String(v['name']).trim(), price_cents: Number(v['price_cents']) })) };
    if (!x['id']) { const i: Item = { id: uid('it'), active: x['active'] !== false, sort: Number(x['sort'] ?? 0), ...row }; S.items.push(i); return i.id; }
    const i = S.items.find(y => y.id === x['id']) ?? err('NOT_FOUND');
    Object.assign(i, row); if (typeof x['active'] === 'boolean') i.active = x['active']; if (x['sort'] != null) i.sort = Number(x['sort']);
    return i.id;
  },
  staff_menu_item_delete: a => { S.items = S.items.filter(i => i.id !== a['_id']); return null; },
  staff_roomservice_settings_save: a => { if (typeof a['_enabled'] === 'boolean') S.settings.enabled = a['_enabled']; if (a['_opens']) S.settings.opens_at = String(a['_opens']).slice(0, 5); if (a['_closes']) S.settings.closes_at = String(a['_closes']).slice(0, 5); return null; },

  staff_stays: () => S.bookings.filter(b => b.active && !b.checked_out_at && ts(b.ends_at) > Date.now()).sort((x, y) => ts(x.starts_at) - ts(y.starts_at))
    .map(b => ({ id: b.id, reference: b.reference, room_number: b.room_number, guest_name: b.guest_name, guests: b.guests, starts_at: b.starts_at, ends_at: b.ends_at, checked_in_at: b.checked_in_at, notice_at: b.notice_at })),
  staff_set_stay: a => {
    const b = bookingOf(String(a['_booking'])), s = String(a['_starts']), e = String(a['_ends']);
    if (ts(e) <= ts(s)) err('INVALID_STAY');
    if (S.bookings.some(o => o.id !== b.id && o.room_number === b.room_number && o.active && !o.checked_out_at && ts(o.starts_at) < ts(e) && ts(o.ends_at) > ts(s))) err('ROOM_BUSY');
    const ch = ts(s) !== ts(b.starts_at), ce = ts(e) !== ts(b.ends_at);
    if (!ch && !ce) return null;
    b.starts_at = iso(ts(s)); b.ends_at = iso(ts(e)); b.notice_kind = ch && ce ? 'both' : ch ? 'start' : 'end'; b.notice_at = iso(Date.now());
    return null;
  },
  staff_pms: () => ({
    bookings: [...S.bookings].sort((x, y) => ts(y.starts_at) - ts(x.starts_at)).map(b => ({ id: b.id, reference: b.reference, room_number: b.room_number, guest_name: b.guest_name, guest_email: b.guest_email, guests: b.guests, starts_at: b.starts_at, ends_at: b.ends_at, active: b.active, dinner_choice: b.dinner_choice, breakfast_choice: b.breakfast_choice, lunch_choice: b.lunch_choice })),
    emails: [...S.emails].sort((x, y) => ts(y.created_at) - ts(x.created_at)).map(e => ({ ...e, reference: bookingOf(e.booking_id).reference })),
    feedback: [...S.feedback].sort((x, y) => ts(y.created_at) - ts(x.created_at)),
  }),
  staff_mock_booking: a => {
    const name = String(a['_name'] ?? '').trim(), email = String(a['_email'] ?? ''), room = String(a['_room'] ?? ''), s = String(a['_start']), e = String(a['_end']), guests = Number(a['_guests'] ?? 2);
    const r = S.rooms.find(x => x.number === room);
    if (!name || !/.+@.+\..+/.test(email) || !r) err('INVALID_BOOKING');
    if (ts(e) <= ts(s)) err('INVALID_STAY');
    if (!Number.isInteger(guests) || guests < 1 || guests > r!.capacity) err('INVALID_GUESTS');
    if (S.bookings.some(o => o.room_number === room && o.active && !o.checked_out_at && ts(o.starts_at) < ts(e) && ts(o.ends_at) > ts(s))) err('ROOM_BUSY');
    const ref = `HP-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const b: DemoBooking = { id: `b-${ref}`, reference: ref, room_number: room, guest_name: name.slice(0, 100), guest_email: email, guests, starts_at: iso(ts(s)), ends_at: iso(ts(e)), checked_in_at: null, checked_out_at: null, active: true, notice_kind: null, notice_at: null, breakfast_choice: null, lunch_choice: null, dinner_choice: null };
    S.bookings.push(b);
    S.emails.push({ id: uid('em'), booking_id: b.id, recipient: email, subject: 'Velkommen til dit ophold', status: 'simuleret', created_at: iso(Date.now()) });
    return ref;
  },

  staff_stats: a => {
    const days = Math.min(Math.max(Number(a['_days'] ?? 14), 1), 365), since = dayKey(Date.now() - (days - 1) * 86400000);
    const live = S.bills.filter(b => !b.voided_at && dayKey(ts(b.created_at)) >= since);
    const group = <K extends string>(key: (b: Bill) => K) => { const m = new Map<K, Bill[]>(); live.forEach(b => m.set(key(b), [...(m.get(key(b)) ?? []), b])); return m; };
    const fb = S.feedback.filter(f => dayKey(ts(f.created_at)) >= since);
    return {
      days,
      revenue_by_day: [...group(b => dayKey(ts(b.created_at))).entries()].sort(([x], [y]) => x.localeCompare(y)).map(([day, xs]) => ({ day, cents: sum(xs) })),
      revenue_by_category: [...group(b => b.category).entries()].map(([category, xs]) => ({ category, cents: sum(xs) })).sort((x, y) => y.cents - x.cents),
      top_items: [...group(b => b.description).entries()].filter(([, xs]) => xs.some(b => ['room_service', 'restaurant_bar', 'minibar'].includes(b.category))).map(([description, xs]) => ({ description, qty: xs.reduce((s, b) => s + b.quantity, 0), cents: sum(xs) })).sort((x, y) => y.qty - x.qty).slice(0, 8),
      orders_by_status: [...S.orders.filter(o => dayKey(ts(o.created_at)) >= since).reduce((m, o) => m.set(statusOf(o), (m.get(statusOf(o)) ?? 0) + 1), new Map<string, number>()).entries()].map(([status, n]) => ({ status, n })),
      rating_avg: fb.length ? Math.round((fb.reduce((s, f) => s + f.rating, 0) / fb.length) * 10) / 10 : null, rating_count: fb.length,
      checkouts: S.checkouts.filter(c => dayKey(ts(c.created_at)) >= since).length,
    };
  },

  staff_members_list: () => [...S.members].sort((x, y) => x.name.localeCompare(y.name)).map(m => ({ id: m.id, name: m.name, role: m.role, active: m.active, created_at: m.created_at })),
  staff_member_save: a => {
    const name = String(a['_name'] ?? '').trim(), pin = String(a['_new_pin'] ?? '');
    if (!['manager', 'reception', 'kitchen', 'housekeeping'].includes(String(a['_role']))) err('INVALID_ROLE');
    if (!name) err('INVALID_NAME');
    if (pin && !/^\d{4,8}$/.test(pin)) err('INVALID_PIN');
    if (pin && (pin === '1234' || S.members.some(m => m.pin === pin && m.id !== a['_id']))) err('PIN_TAKEN');
    if (!a['_id']) { if (!pin) err('INVALID_PIN'); const m: Member = { id: uid('m'), name: name.slice(0, 80), role: String(a['_role']), pin, active: a['_active'] !== false, created_at: iso(Date.now()) }; S.members.push(m); return m.id; }
    const m = S.members.find(x => x.id === a['_id']) ?? err('MEMBER_NOT_FOUND');
    m.name = name.slice(0, 80); m.role = String(a['_role']); if (typeof a['_active'] === 'boolean') m.active = a['_active']; if (pin) m.pin = pin;
    return m.id;
  },
  staff_member_delete: a => { S.members = S.members.filter(m => m.id !== a['_id']); return null; },
  staff_settings: () => ({ wifi_ssid: S.wifi.ssid, wifi_password: S.wifi.password, roomservice: { ...S.settings }, me: { name: WHO, role: 'manager' } }),
  staff_set_wifi: a => { if (!String(a['_ssid'] ?? '').trim() || String(a['_password'] ?? '').length < 8) err('INVALID_WIFI'); S.wifi = { ssid: String(a['_ssid']).trim(), password: String(a['_password']) }; return null; },
  staff_set_master_pin: () => null,
};

const MUTATING = /^(staff_(set|check_in|bill_add|bill_edit|bill_void|checkout|menu_.*(save|delete)|roomservice|member_(save|delete)|mock|room_rate))/;

/** Samme form som supabase.rpc, så personalesiden kan bruge den uændret. */
export async function demoRpc<T = unknown>(name: string, args: Dict): Promise<{ data: T | null; error: { message?: string } | null }> {
  try {
    if (args['_pin'] !== DEMO_PIN) err('FORBIDDEN');
    const h = H[name] ?? err(`Funktionen ${name} findes ikke i demoen`);
    const out = h(args);
    if (MUTATING.test(name)) emit();
    return { data: (out === undefined ? null : out) as T, error: null };
  } catch (e) {
    return { data: null, error: { message: (e as Error).message } };
  }
}

/** Gæstens handlinger i demoen (samme regler som guest_*-funktionerne i databasen). */
export const demoGuest = {
  booking: () => S.bookings.find(b => b.room_number === DEMO_GUEST_ROOM && b.reference === 'HP-1001')!,
  menu: (): GuestMenu => ({
    settings: { enabled: S.settings.enabled, opens_at: S.settings.opens_at, closes_at: S.settings.closes_at, open_now: S.settings.enabled && inHours(S.settings.opens_at, S.settings.closes_at) },
    categories: [...S.cats].filter(c => c.active).sort((a, b) => a.sort - b.sort).map(c => ({ id: c.id, name: c.name, items: S.items.filter(i => i.category_id === c.id && i.active).sort((a, b) => a.sort - b.sort)
      .map(i => ({ id: i.id, name: i.name, description: i.description, price_cents: i.price_cents, image_url: i.image_url, variants: i.variants, addons: i.addons, available_now: inHours(i.available_from, i.available_to), available_from: i.available_from, available_to: i.available_to })) })),
  }),
  orderMenu(lines: { item_id: string; qty: number; variant: string | null; addons: string[] }[], note: string) {
    const b = demoGuest.booking();
    if (!S.settings.enabled || !inHours(S.settings.opens_at, S.settings.closes_at)) err('ROOMSERVICE_CLOSED');
    if (!lines.length || lines.length > 30) err('EMPTY_ORDER');
    const out: OrderLine[] = []; let details = ''; let total = 0;
    for (const ln of lines) {
      if (!Number.isInteger(ln.qty) || ln.qty < 1 || ln.qty > 10) err('INVALID_ORDER');
      const it = S.items.find(i => i.id === ln.item_id && i.active && S.cats.find(c => c.id === i.category_id)?.active);
      if (!it || !inHours(it.available_from, it.available_to)) err('ITEM_UNAVAILABLE');
      let unit = it!.price_cents, label = it!.name.replace(/,/g, ' ');
      if (it!.variants.length) { const v = it!.variants.find(x => x.name === ln.variant); if (!v) err('INVALID_ORDER'); unit += v!.price_delta_cents; label += ` (${v!.name.replace(/,/g, ' ')})`; }
      for (const an of ln.addons ?? []) { const ad = it!.addons.find(x => x.name === an); if (!ad) err('INVALID_ORDER'); unit += ad!.price_cents; label += ` + ${an.replace(/,/g, ' ')}`; }
      out.push({ item_id: it!.id, name: label, qty: ln.qty, unit_cents: unit }); total += ln.qty * unit;
      details += `${details ? ', ' : ''}${ln.qty}× ${label}`;
    }
    const n = note.trim().slice(0, 200); if (n) details += ` — Note: ${n}`;
    const id = guestOrder(b.id, 'room_service', details.slice(0, 1000), { items: out, total_cents: total });
    emit();
    return id;
  },
  orderTowels(qty: number) {
    const b = demoGuest.booking();
    if (!Number.isInteger(qty) || qty < 1 || qty > b.guests) err('TOWEL_LIMIT');
    const last = S.orders.filter(o => o.booking_id === b.id && o.type === 'towels' && !o.cancelled && o.status !== 'cancelled').reduce((m, o) => Math.max(m, ts(o.created_at)), 0);
    if (last && last + 12 * 3600e3 > Date.now()) err('TOWEL_COOLDOWN');
    const id = guestOrder(b.id, 'towels', `${qty} poolhåndklæder til bytte`, { quantity: qty });
    emit();
    return id;
  },
  orders: () => S.orders.filter(o => o.booking_id === demoGuest.booking().id).sort((a, c) => ts(c.created_at) - ts(a.created_at)).slice(0, 20)
    .map(o => ({ id: o.id, type: o.type, details: o.details, status: statusOf(o), created_at: o.created_at, total_cents: o.total_cents, reject_reason: o.reject_reason })),
  cancelOrder(id: string) {
    const o = S.orders.find(x => x.id === id && x.booking_id === demoGuest.booking().id);
    if (!o || o.cancelled || !['pending', 'accepted', 'in_progress'].includes(o.status)) err('ORDER_NOT_CANCELLABLE');
    o!.cancelled = true; o!.updated_at = iso(Date.now()); emit();
  },
  bill: () => { const b = demoGuest.booking(), live = liveItems(b.id); return { items: live.map(i => ({ id: i.id, category: i.category, description: i.description, quantity: i.quantity, unit_price_cents: i.unit_price_cents, paid: i.paid, created_at: i.created_at })), total_cents: sum(live), due_cents: sum(live.filter(i => !i.paid)) }; },
  cleaning: () => S.cleaning.filter(c => c.booking_id === demoGuest.booking().id).sort((a, c) => ts(c.created_at) - ts(a.created_at))[0] ?? null,
  requestCleaning(towels: number, from: Date | null, until: Date | null) {
    const b = demoGuest.booking();
    if (S.cleaning.some(c => c.booking_id === b.id && ['requested', 'in_progress'].includes(c.status))) err('CLEANING_ALREADY_REQUESTED');
    if (S.cleaning.some(c => c.booking_id === b.id && c.kind === 'guest' && c.status !== 'not_reached' && ts(c.created_at) > Date.now() - 12 * 3600e3)) err('CLEANING_COOLDOWN');
    const repeat = S.cleaning.some(c => c.booking_id === b.id && c.status === 'not_reached'), now = iso(Date.now());
    S.cleaning.push({ id: uid('c'), booking_id: b.id, room_number: b.room_number, wants_towels: towels > 0, towel_count: towels, away_from: from ? from.toISOString() : null, away_until: until ? until.toISOString() : null, status: 'requested', is_repeat: repeat, kind: 'guest', created_at: now, updated_at: now });
    S.rooms.find(r => r.number === b.room_number)!.housekeeping_status = 'needs_cleaning'; emit();
  },
  setMeal(meal: 'breakfast' | 'lunch' | 'dinner', choice: 'hotel' | 'out' | null) { demoGuest.booking()[`${meal}_choice` as const] = choice; emit(); },
  checkIn() { const b = demoGuest.booking(); b.checked_in_at = b.checked_in_at ?? iso(Date.now()); S.rooms.find(r => r.number === b.room_number)!.housekeeping_status = 'occupied'; emit(); },
  /** Demo: spol til opholdets start (ellers skal man vente 90 sek.) eller afslut opholdet uden regning. */
  resetTimes() { const b = demoGuest.booking(); b.starts_at = iso(Date.now() + 90000); b.checked_in_at = null; b.notice_kind = null; b.notice_at = null; emit(); },
  endStay() { const b = demoGuest.booking(); b.ends_at = iso(Date.now()); b.checked_in_at = b.checked_in_at ?? iso(Date.now()); emit(); },
  rate(rating: number, comment: string) { const b = demoGuest.booking(); S.feedback.push({ id: uid('f'), booking_id: b.id, room_number: b.room_number, rating, comment, created_at: iso(Date.now()) }); emit(); },
};

export const demoStore = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  version: () => version,
  reset() { S = seed(); emit(); },
  /** Til tests. */
  _state: () => S,
};
