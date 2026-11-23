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
    expect(d.open_tasks).toBe((await call('staff_cleaning')).requests.filter((r: { status: string }) => ['requested', 'in_progress'].includes(r.status)).length);
  });

  it('medarbejdere: unik kode og gyldig rolle', async () => {
    const id = await call('staff_member_save', { _id: null, _name: 'Mette', _role: 'kitchen', _new_pin: '5678', _active: true });
    expect(await fails('staff_member_save', { _id: null, _name: 'Y', _role: 'reception', _new_pin: '5678', _active: true })).toBe('PIN_TAKEN');
    expect(await fails('staff_member_save', { _id: null, _name: 'Y', _role: 'chef', _new_pin: '9999', _active: true })).toBe('INVALID_ROLE');
    await call('staff_member_delete', { _id: id });
    expect(await call('staff_members_list')).toHaveLength(0);
  });
});
