import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_PIN, demoGuest, demoRpc, demoStore } from '@/lib/demo-db';

const call = async <T = any>(name: string, args: Record<string, unknown> = {}) => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await demoRpc<T>(name, { _pin: DEMO_PIN, ...args });
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};
const fails = async (name: string, args: Record<string, unknown> = {}) => { const r = await demoRpc(name, { _pin: DEMO_PIN, ...args }); return r.error?.message ?? null; };
const inHouse = async (room: string) => (await call('staff_guests')).find((g: { room_number: string }) => g.room_number === room);

beforeEach(() => demoStore.reset());

describe('demo-database: samme regler som SQL', () => {
  it('kræver demo-koden', async () => { expect((await demoRpc('staff_guests', { _pin: 'x' })).error?.message).toBe('FORBIDDEN'); });

  it('gæstens roomservice-bestilling dukker op hos personalet med server-beregnet pris', async () => {
    demoGuest.checkIn();
    const before = (await call('staff_dashboard')).new_orders;
    const menu = demoGuest.menu();
    const beer = menu.categories.flatMap(c => c.items).find(i => i.name === 'Fadøl')!;
    const club = menu.categories.flatMap(c => c.items).find(i => i.name === 'Club sandwich')!;
    demoGuest.orderMenu([{ item_id: beer.id, qty: 2, variant: '50 cl', addons: [] }, { item_id: club.id, qty: 1, variant: null, addons: ['Ekstra bacon'] }], 'uden løg');
    const orders = await call('staff_orders', { _limit: 5 });
    const mine = orders.find((o: { room_number: string; type: string }) => o.room_number === '101' && o.type === 'room_service');
    expect(mine.total_cents).toBe(2 * (5500 + 1500) + 14500 + 1500);
    expect(mine.details).toContain('2× Fadøl (50 cl)');
    expect(mine.details).toContain('Note: uden løg');
    expect(mine.guest_name).toBe('Anna Nielsen');
    expect((await call('staff_dashboard')).new_orders).toBe(before + 1);
  });

  it('afviser ugyldige og lukkede bestillinger', async () => {
    const beer = demoGuest.menu().categories.flatMap(c => c.items).find(i => i.name === 'Fadøl')!;
    expect(() => demoGuest.orderMenu([{ item_id: beer.id, qty: 1, variant: 'Gigant', addons: [] }], '')).toThrow('INVALID_ORDER');
    expect(() => demoGuest.orderMenu([{ item_id: beer.id, qty: 99, variant: '33 cl', addons: [] }], '')).toThrow('INVALID_ORDER');
    expect(() => demoGuest.orderMenu([{ item_id: 'findes-ikke', qty: 1, variant: null, addons: [] }], '')).toThrow('ITEM_UNAVAILABLE');
    await call('staff_menu_item_save', { _item: { ...beer, category_id: beer.id && 'c-drik', active: false, price_cents: 5500 } });
    expect(() => demoGuest.orderMenu([{ item_id: beer.id, qty: 1, variant: '33 cl', addons: [] }], '')).toThrow('ITEM_UNAVAILABLE');
    const h = new Date().getHours();
    await call('staff_roomservice_settings_save', { _enabled: true, _opens: `${String((h + 2) % 24).padStart(2, '0')}:00`, _closes: `${String((h + 3) % 24).padStart(2, '0')}:00` });
    expect(demoGuest.menu().settings?.open_now).toBe(false);
    expect(() => demoGuest.orderMenu([{ item_id: 'i-suppe', qty: 1, variant: null, addons: [] }], '')).toThrow('ROOMSERVICE_CLOSED');
  });

  it('leveret roomservice lægges på regningen én gang; afvist og annulleret gør ikke', async () => {
    const id = demoGuest.orderMenu([{ item_id: 'i-suppe', qty: 2, variant: null, addons: [] }], '');
    const b = demoGuest.booking().id;
    for (const s of ['accepted', 'in_progress', 'ready']) await call('staff_set_order_status', { _order: id, _status: s });
    expect((await call('staff_bill', { _booking: b })).items).toHaveLength(0);
    await call('staff_set_order_status', { _order: id, _status: 'done' });
    const bill = await call('staff_bill', { _booking: b });
    expect(bill.items).toHaveLength(1);
    expect(bill.total_cents).toBe(2 * 9500);
    expect(await fails('staff_set_order_status', { _order: id, _status: 'done' })).toBe('ORDER_CLOSED');
    const rej = demoGuest.orderMenu([{ item_id: 'i-suppe', qty: 1, variant: null, addons: [] }], '');
    await call('staff_set_order_status', { _order: rej, _status: 'rejected', _reason: 'Udsolgt' });
    const cx = demoGuest.orderMenu([{ item_id: 'i-suppe', qty: 1, variant: null, addons: [] }], '');
    demoGuest.cancelOrder(cx);
    expect((await call('staff_bill', { _booking: b })).total_cents).toBe(2 * 9500);
    expect(demoGuest.orders().find(o => o.id === rej)?.reject_reason).toBe('Udsolgt');
    expect(demoGuest.bill().total_cents).toBe(2 * 9500);
  });

  it('rengøring: kun 1 gang hver 12. time, men "ikke nået" kan bestilles igen', async () => {
    demoGuest.checkIn();
    demoGuest.requestCleaning(0, null, null);
    expect(() => demoGuest.requestCleaning(0, null, null)).toThrow('CLEANING_ALREADY_REQUESTED');
    const task = (await call('staff_cleaning')).requests.find((r: { room_number: string; status: string }) => r.room_number === '101' && r.status === 'requested');
    await call('staff_set_cleaning', { _request: task.id, _status: 'done' });
    expect(() => demoGuest.requestCleaning(0, null, null)).toThrow('CLEANING_COOLDOWN');
    const again = demoStore._state().cleaning.find(c => c.id === task.id)!;
    again.status = 'not_reached';
    expect(() => demoGuest.requestCleaning(0, null, null)).not.toThrow();
  });

  it('overskredne ophold bliver på listen og kan tjekkes ud', async () => {
    const b = demoStore._state().bookings.find(x => x.room_number === '203')!;
    b.ends_at = new Date(Date.now() - 2 * 3600e3).toISOString();
    expect((await call('staff_guests')).find((g: { id: string }) => g.id === b.id)).toMatchObject({ overdue: true, in_house: false });
    expect((await call('staff_rooms')).find((r: { number: string }) => r.number === '203').overdue_booking_id).toBe(b.id);
    expect((await call('staff_dashboard')).departures.some((d: { id: string }) => d.id === b.id)).toBe(true);
    await call('staff_checkout', { _booking: b.id, _method: 'Kontant', _note: '' });
    expect((await call('staff_guests')).some((g: { id: string }) => g.id === b.id)).toBe(false);
  });

  it('håndklæder: højst antal personer og kun 1 gang hver 12. time', async () => {
    expect(() => demoGuest.orderTowels(3)).toThrow('TOWEL_LIMIT');
    demoGuest.orderTowels(2);
    expect(() => demoGuest.orderTowels(1)).toThrow('TOWEL_COOLDOWN');
    expect((await call('staff_orders', { _limit: 5 })).some((o: { room_number: string; type: string }) => o.room_number === '101' && o.type === 'towels')).toBe(true);
  });

  it('salg, rettelser, kreditering, annullering og overnatning', async () => {
    const g = await inHouse('201');
    await call('staff_room_rate_set', { _room: '201', _cents: 100000 });
    const a = await call('staff_bill_add', { _booking: g.id, _category: 'minibar', _description: 'Cola', _qty: 2, _unit_cents: 3500 });
    await call('staff_bill_edit', { _item: a, _category: 'minibar', _description: 'Cola Zero', _qty: 3, _unit_cents: 3500 });
    const credit = await call('staff_bill_add', { _booking: g.id, _category: 'other', _description: 'Kulance', _qty: 1, _unit_cents: -5000 });
    expect((await call('staff_bill', { _booking: g.id })).total_cents).toBe(10500 - 5000);
    await call('staff_bill_void', { _item: credit, _reason: 'Fejl' });
    const bill = await call('staff_bill', { _booking: g.id });
    expect(bill.total_cents).toBe(10500);
    expect(bill.items.some((i: { voided_at: string | null }) => i.voided_at)).toBe(true);
    await call('staff_bill_add_accommodation', { _booking: g.id });
    expect(await fails('staff_bill_add_accommodation', { _booking: g.id })).toBe('ALREADY_ADDED');
    expect(await fails('staff_bill_add', { _booking: g.id, _category: 'x', _description: 'y', _qty: 1, _unit_cents: 1 })).toBe('INVALID_CATEGORY');
    expect(await fails('staff_bill_add', { _booking: g.id, _category: 'other', _description: ' ', _qty: 1, _unit_cents: 1 })).toBe('INVALID_NAME');
  });

  it('checkout: kræver lukkede ordrer og betaling, afslutter opholdet og opretter rengøring', async () => {
    const g = await inHouse('201'); // har en ny roomservice-ordre fra start
    expect(await fails('staff_checkout', { _booking: g.id, _method: 'Kort', _note: '' })).toBe('OPEN_ORDERS');
    const open = (await call('staff_orders')).find((o: { room_number: string; status: string }) => o.room_number === '201' && o.status === 'pending');
    await call('staff_set_order_status', { _order: open.id, _status: 'done' });
    const bill = await call('staff_bill', { _booking: g.id });
    expect(bill.due_cents).toBe(14500);
    expect(await fails('staff_checkout', { _booking: g.id, _method: '', _note: '' })).toBe('PAYMENT_REQUIRED');
    await call('staff_checkout', { _booking: g.id, _method: 'Betalingsterminal', _note: 'Tak' });
    expect(await fails('staff_checkout', { _booking: g.id, _method: 'Kort', _note: '' })).toBe('ALREADY_CHECKED_OUT');
    expect(await fails('staff_bill_add', { _booking: g.id, _category: 'other', _description: 'x', _qty: 1, _unit_cents: 1 })).toBe('BILL_CLOSED');
    expect((await call('staff_rooms')).find((r: { number: string }) => r.number === '201').housekeeping_status).toBe('needs_cleaning');
    const task = (await call('staff_cleaning')).requests.find((r: { room_number: string }) => r.room_number === '201');
    expect(task).toMatchObject({ kind: 'checkout', status: 'requested', towel_count: 2 });
    expect(await fails('staff_set_cleaning', { _request: task.id, _status: 'not_reached' })).toBe('INVALID_STATUS');
    await call('staff_set_cleaning', { _request: task.id, _status: 'done' });
    expect((await call('staff_rooms')).find((r: { number: string }) => r.number === '201').housekeeping_status).toBe('clean');
    expect(await inHouse('201')).toBeUndefined();
    const hist = await call('staff_history', { _kind: 'checkouts', _q: 'mads', _from: null, _to: null });
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ total_cents: 14500, payment_method: 'Betalingsterminal', checked_out_by: 'Demo-leder' });
    expect(await call('staff_history', { _kind: 'checkouts', _q: '', _from: '2000-01-01', _to: '2000-01-02' })).toHaveLength(0);
    expect((await call('staff_history', { _kind: 'sales', _q: 'club', _from: null, _to: null })).length).toBeGreaterThan(0);
    expect(await fails('staff_history', { _kind: 'x', _q: '' })).toBe('INVALID_KIND');
  });

  it('checkout af demo-gæsten afslutter hendes ophold i gæsteappen', async () => {
    demoGuest.checkIn();
    const b = demoGuest.booking();
    b.starts_at = new Date(Date.now() - 3600e3).toISOString(); // opholdet er i gang
    await call('staff_checkout', { _booking: b.id, _method: 'Kontant', _note: '' });
    expect(Date.parse(demoGuest.booking().ends_at)).toBeLessThanOrEqual(Date.now());
    expect(demoGuest.booking().checked_out_at).not.toBeNull();
  });

  it('bookinger: kan ikke dobbeltbookes, ændret tid giver besked til gæsten', async () => {
    const now = Date.now();
    expect(await fails('staff_mock_booking', { _name: 'X', _email: 'x@y.dk', _room: '201', _start: new Date(now).toISOString(), _end: new Date(now + 3600e3).toISOString(), _guests: 2 })).toBe('ROOM_BUSY');
    expect(await fails('staff_mock_booking', { _name: 'X', _email: 'x@y.dk', _room: '104', _start: new Date(now).toISOString(), _end: new Date(now + 3600e3).toISOString(), _guests: 9 })).toBe('INVALID_GUESTS');
    const ref = await call('staff_mock_booking', { _name: 'Ny Gæst', _email: 'ny@y.dk', _room: '104', _start: new Date(now).toISOString(), _end: new Date(now + 86400e3).toISOString(), _guests: 2 });
    expect((await call('staff_pms')).emails.some((e: { reference: string }) => e.reference === ref)).toBe(true);
    const guest = demoGuest.booking();
    await call('staff_set_stay', { _booking: guest.id, _starts: guest.starts_at, _ends: new Date(Date.parse(guest.ends_at) + 3600e3).toISOString() });
    expect(demoGuest.booking().notice_kind).toBe('end');
  });

  it('dashboard og værelser hænger sammen', async () => {
    const d = await call('staff_dashboard');
    const rooms = await call('staff_rooms');
    expect(d.rooms_total).toBe(12);
    expect(rooms.filter((r: { guest_name: string | null }) => r.guest_name).length).toBe(d.occupied);
    expect(d.free).toBe(12 - d.occupied);
    const towelTasks = (await call('staff_orders')).filter((o: { type: string; status: string }) => o.type === 'towels' && ['pending', 'accepted', 'in_progress', 'ready'].includes(o.status)).length;
    expect(d.open_tasks).toBe((await call('staff_cleaning')).requests.filter((r: { status: string }) => ['requested', 'in_progress'].includes(r.status)).length + towelTasks);
    // håndklæde-bytte er en opgave, ikke en roomservice-ordre
    expect(d.new_orders).toBe((await call('staff_orders')).filter((o: { type: string; status: string }) => o.type === 'room_service' && o.status === 'pending').length);
  });

  it('personalet kan tjekke gæster ind; før start starter opholdet nu', async () => {
    const g = (await call('staff_guests')).find((x: { room_number: string }) => x.room_number === '303');
    expect(g.in_house).toBe(false);
    await call('staff_check_in', { _booking: g.id });
    const after = (await call('staff_guests')).find((x: { id: string }) => x.id === g.id);
    expect(after).toMatchObject({ in_house: true });
    expect(after.checked_in_at).not.toBeNull();
    expect(await fails('staff_check_in', { _booking: g.id })).toBe('ALREADY_CHECKED_IN');
    expect((await call('staff_bill', { _booking: g.id })).booking.guest_email).toContain('@');
  });

  it('anmeldelser: gennemsnit, fordeling, filter og søgning', async () => {
    const all = await call('staff_feedback', { _rating: null, _q: '' });
    expect(all.count).toBe(4);
    expect(all.distribution.map((d: { rating: number }) => d.rating)).toEqual([5, 4, 3, 2, 1]);
    expect(all.items.every((i: { guest_name: string | null }) => i.guest_name)).toBe(true);
    expect((await call('staff_feedback', { _rating: 5, _q: '' })).items).toHaveLength(2);
    expect((await call('staff_feedback', { _rating: null, _q: 'morgenmad' })).items).toHaveLength(1);
    demoGuest.rate(2, 'Støj');
    expect((await call('staff_feedback', { _rating: null, _q: '' })).count).toBe(5);
  });

  it('betaling af regning uden checkout, med historik', async () => {
    const g = await inHouse('203'); // har 70 kr. på regningen fra start
    expect(g.balance_cents).toBe(7000);
    expect(await fails('staff_bill_pay', { _booking: g.id, _method: '', _note: '' })).toBe('PAYMENT_REQUIRED');
    const pid = await call('staff_bill_pay', { _booking: g.id, _method: 'Betalingsterminal', _note: 'ok' });
    const bill = await call('staff_bill', { _booking: g.id });
    expect(bill).toMatchObject({ due_cents: 0, paid_in_app_cents: 7000 });
    expect(bill.items.every((i: { paid: boolean; payment_id: string }) => i.paid && i.payment_id === pid)).toBe(true);
    expect(bill.booking.checked_out_at).toBeNull();
    expect(await fails('staff_bill_pay', { _booking: g.id, _method: 'Kontant', _note: '' })).toBe('NOTHING_DUE');
    expect(await fails('staff_bill_edit', { _item: bill.items[0].id, _category: 'minibar', _description: 'x', _qty: 1, _unit_cents: 1 })).toBe('ITEM_PAID');
    expect(await fails('staff_bill_void', { _item: bill.items[0].id, _reason: '' })).toBe('ITEM_PAID');
    expect((await inHouse('203')).balance_cents).toBe(0);
    await call('staff_bill_add', { _booking: g.id, _category: 'minibar', _description: 'Vand', _qty: 1, _unit_cents: 2500 });
    const pays = await call('staff_payments', { _q: 'holm', _from: null, _to: null });
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ amount_cents: 7000, method: 'Betalingsterminal', guest_name: 'Maria Holm', kind: 'bill' });
    expect(pays[0].items).toHaveLength(1);
    expect(await call('staff_payments', { _q: 'findes-ikke', _from: null, _to: null })).toHaveLength(0);
    // checkout betaler kun resten og kommer i historikken
    await call('staff_checkout', { _booking: g.id, _method: 'Kontant', _note: '' });
    const after = await call('staff_payments', { _q: '203', _from: null, _to: null });
    expect(after).toHaveLength(2);
    expect(after.find((p: { kind: string }) => p.kind === 'checkout')).toMatchObject({ amount_cents: 2500 });
  });

  it('gæsteinfo: personer, enheder, aktivitet og tidslinje', async () => {
    const holm = demoStore._state().bookings.find(b => b.room_number === '304')!;
    const info = await call('staff_guest_info', { _booking: holm.id });
    expect(info.booking).toMatchObject({ guests: 4, room_number: '304' });
    expect(info.devices).toMatchObject({ count: 3, max: 6 });
    expect(info.activity.unlocks).toBe(6);
    expect(info.activity.timeline.length).toBeGreaterThan(3);
    expect(info.activity.timeline.some((t: { kind: string }) => t.kind === 'unlock')).toBe(true);
    demoGuest.checkIn(); demoGuest.unlock(); demoGuest.orderTowels(1);
    const anna = await call('staff_guest_info', { _booking: demoGuest.booking().id });
    expect(anna.devices.count).toBe(1);
    expect(anna.activity).toMatchObject({ unlocks: 1, orders_total: 1 });
    expect(anna.activity.timeline.some((t: { text: string }) => /1 håndklæder/.test(t.text))).toBe(true);
  });

  it('billeder til menuvarer: upload, version og fjern', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(await fails('staff_menu_item_image_set', { _item: 'i-club', _data: 'http://x' })).toBe('INVALID_IMAGE');
    await call('staff_menu_item_image_set', { _item: 'i-club', _data: png });
    const item = demoGuest.menu().categories.flatMap(c => c.items).find(i => i.id === 'i-club')!;
    expect(typeof item.image_ver).toBe('number');
    expect(Object.keys(item)).not.toContain('data');
    expect((await demoRpc('menu_item_image', { _id: 'i-club' })).data).toBe(png);
    expect((await call('staff_menu')).items.find((i: { id: string }) => i.id === 'i-club').image_ver).toBe(item.image_ver);
    await call('staff_menu_item_image_remove', { _item: 'i-club' });
    expect((await demoRpc('menu_item_image', { _id: 'i-club' })).data).toBeNull();
    expect(demoGuest.menu().categories.flatMap(c => c.items).find(i => i.id === 'i-club')!.image_ver).toBeNull();
  });

  it('roomservice lukker 2 timer før opholdet slutter', async () => {
    const b = demoGuest.booking();
    b.starts_at = new Date(Date.now() - 3600e3).toISOString();
    b.ends_at = new Date(Date.now() + 119 * 60e3).toISOString();
    expect(() => demoGuest.orderMenu([{ item_id: 'i-suppe', qty: 1, variant: null, addons: [] }], '')).toThrow('ROOMSERVICE_STAY_ENDING');
    b.ends_at = new Date(Date.now() + 3 * 3600e3).toISOString();
    expect(() => demoGuest.orderMenu([{ item_id: 'i-suppe', qty: 1, variant: null, addons: [] }], '')).not.toThrow();
  });

  it('tjekket ud: seneste først med beløb, og filter på dage', async () => {
    const g = await inHouse('203');
    await call('staff_bill_pay', { _booking: g.id, _method: 'Kontant', _note: '' });
    await call('staff_checkout', { _booking: g.id, _method: '', _note: '' });
    const today = await call('staff_checked_out', { _days: 1 });
    expect(today).toHaveLength(1);
    expect(today[0]).toMatchObject({ room_number: '203', guest_name: 'Maria Holm', total_cents: 7000, payment_method: '' });
    expect(today[0].checked_out_at).toBeTruthy();
    demoStore._state().bookings.find(x => x.id === g.id)!.checked_out_at = new Date(Date.now() - 3 * 86400e3).toISOString();
    expect(await call('staff_checked_out', { _days: 1 })).toHaveLength(0);
    expect(await call('staff_checked_out', { _days: 7 })).toHaveLength(1);
  });

  it('rumdetaljer: lejeperiode, gæster, enheder, regning, ordrer og næste/seneste gæst', async () => {
    const d = await call('staff_room_detail', { _room: '201' });
    expect(d.stay).toMatchObject({ guest_name: 'Mads Jensen', guests: 2, devices: 2, devices_max: 4, overdue: false });
    expect(d.stay.nights).toBeGreaterThanOrEqual(1);
    expect(d.orders).toHaveLength(1);
    expect(d.bill).toMatchObject({ due_cents: 0 });
    const empty = await call('staff_room_detail', { _room: '104' });
    expect(empty).toMatchObject({ stay: null, bill: null, orders: [] });
    const arriving = await call('staff_room_detail', { _room: '303' });
    expect(arriving.next_booking).toMatchObject({ guest_name: 'Jens Aaby' });
    expect(await fails('staff_room_detail', { _room: '999' })).toBe('ROOM_NOT_FOUND');
    const g = await inHouse('201');
    await call('staff_bill_add', { _booking: g.id, _category: 'minibar', _description: 'Cola', _qty: 1, _unit_cents: 3500 });
    expect((await call('staff_room_detail', { _room: '201' })).bill).toMatchObject({ total_cents: 3500, due_cents: 3500, items: 1 });
  });

  it('rum-klar og seneste rengøring/håndklæder følger med gæstelisten og rumpleje', async () => {
    const g = (await call('staff_guests'))[0];
    const room = g.room_number as string;
    demoStore._state().rooms.find(r => r.number === room)!.housekeeping_status = 'needs_cleaning';
    const row = (await call('staff_guests')).find((x: { room_number: string }) => x.room_number === room);
    expect(row.room_status).toBe('needs_cleaning');
    expect(row.last_cleaned_at).toBeNull();
    const care = await call('staff_room_care', { _room: room });
    expect(care.room_status).toBe('needs_cleaning');
    expect(care.last_towels_swapped_at).toBeNull();
  });

  it('funktioner kan slås fra og blokerer gæstens bestilling', async () => {
    expect((await call('staff_features')).towels).toBe(true);
    await call('staff_set_feature', { _key: 'towels', _enabled: false });
    await call('staff_set_feature', { _key: 'roomservice', _enabled: false });
    expect(demoGuest.features()).toMatchObject({ towels: false, roomservice: false, cleaning: true });
    demoGuest.checkIn();
    expect(() => demoGuest.orderTowels(1)).toThrow('FEATURE_OFF');
    expect(await fails('staff_set_feature', { _key: 'nonsens', _enabled: true })).toBe('INVALID_FEATURE');
  });

  it('beskeder til gæster: vises for gæsten og kan fjernes', async () => {
    expect(await fails('staff_post_announcement', { _message: '   ' })).toBe('INVALID_MESSAGE');
    const id = await call<string>('staff_post_announcement', { _message: '50 % i baren' });
    expect(demoGuest.announcements().map(a => a.message)).toEqual(['50 % i baren']);
    await call('staff_remove_announcement', { _id: id });
    expect(demoGuest.announcements()).toHaveLength(0);
  });

  it('beskeder kan have udløb, og gamle beskeder bliver i historikken', async () => {
    expect(await fails('staff_post_announcement', { _message: 'x', _expires_at: new Date(Date.now() - 1000).toISOString() })).toBe('INVALID_EXPIRY');
    await call('staff_post_announcement', { _message: 'Kort', _expires_at: new Date(Date.now() + 3600e3).toISOString() });
    await call('staff_post_announcement', { _message: 'Hele opholdet' });
    expect(demoGuest.announcements().map(a => a.message).sort()).toEqual(['Hele opholdet', 'Kort']);
    demoStore._state().announcements.find(a => a.message === 'Kort')!.expires_at = new Date(Date.now() - 1000).toISOString();
    expect(demoGuest.announcements().map(a => a.message)).toEqual(['Hele opholdet']);
  });

  it('afvisning uden årsag bruger standardbeskeden, og standardbeskeden kan rettes', async () => {
    demoGuest.checkIn();
    const item = demoGuest.menu().categories.flatMap(c => c.items).find(i => i.variants.length === 0 && i.addons.length === 0)!;
    demoGuest.orderMenu([{ item_id: item.id, qty: 1, variant: null, addons: [] }], '');
    const open = () => demoGuest.orders().find(o => o.type === 'room_service' && o.status === 'pending')!;
    await call('staff_set_order_status', { _order: open().id, _status: 'rejected', _reason: '  ' });
    expect(demoGuest.orders().find(o => o.status === 'rejected')!.reject_reason).toBe('Vi kan desværre ikke levere din bestilling lige nu.');
    await call('staff_set_reject_message', { _message: 'Køkkenet er lukket' });
    expect((await call('staff_settings')).roomservice.reject_message).toBe('Køkkenet er lukket');
    demoGuest.orderMenu([{ item_id: item.id, qty: 1, variant: null, addons: [] }], '');
    await call('staff_set_order_status', { _order: open().id, _status: 'rejected', _reason: 'Udsolgt' });
    expect(demoGuest.orders().filter(o => o.status === 'rejected').map(o => o.reject_reason)).toContain('Udsolgt');
    expect(await fails('staff_set_reject_message', { _message: '' })).toBe('INVALID_MESSAGE');
  });

  it('poolhåndklæder fra opgaver lukker gæstens bestilling og starter 12-timers reglen', async () => {
    demoGuest.checkIn();
    demoGuest.orderTowels(1);
    await call('staff_pool_towels', { _room: '101' });
    const open = (await call('staff_orders', { _limit: 50 })).filter((o: { room_number: string; type: string; status: string }) => o.room_number === '101' && o.type === 'towels' && o.status !== 'done');
    expect(open).toHaveLength(0);
    expect(() => demoGuest.orderTowels(1)).toThrow('TOWEL_COOLDOWN');
    expect(await fails('staff_pool_towels', { _room: '103' })).toBe('NO_GUEST_IN_ROOM');
  });

  it('gæsteinfo viser ingen anmeldelse (de skrives først efter opholdet)', async () => {
    const info = await call('staff_guest_info', { _booking: demoStore._state().bookings.find(b => b.room_number === '201')!.id });
    expect(Object.keys(info.activity)).not.toContain('review');
    expect(info.activity.timeline.some((t: { kind: string }) => t.kind === 'review')).toBe(false);
  });

  it('medarbejdere: unik kode og gyldig rolle', async () => {
    const id = await call('staff_member_save', { _id: null, _name: 'Mette', _role: 'kitchen', _new_pin: '5678', _active: true });
    expect(await fails('staff_member_save', { _id: null, _name: 'Y', _role: 'reception', _new_pin: '5678', _active: true })).toBe('PIN_TAKEN');
    expect(await fails('staff_member_save', { _id: null, _name: 'Y', _role: 'chef', _new_pin: '9999', _active: true })).toBe('INVALID_ROLE');
    await call('staff_member_delete', { _id: id });
    expect(await call('staff_members_list')).toHaveLength(0);
  });
});
