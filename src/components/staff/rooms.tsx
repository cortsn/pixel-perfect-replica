import { useMemo, useState } from 'react';
import { AlertTriangle, BedDouble, Check, ChevronDown, Info, LogOut, Receipt, Search, Smartphone, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { CLEANING_LABELS, type CleaningStatus } from '@/lib/cleaning';
import { HOUSEKEEPING_LABELS, ORDER_LABELS, type HousekeepingStatus, type OrderStatus } from '@/lib/hotel';
import { fmtDKK } from '@/lib/money';
import { PageTitle, card, dayTime, field, hm, useAct, useStaff, useStaffData } from '@/components/staff/core';
import { relativeTime } from '@/components/staff/guests';

export type Room = {
  number: string; floor: number; capacity: number; housekeeping_status: HousekeepingStatus; rate_cents: number;
  guest_name: string | null; booking_id: string | null; ends_at: string | null; guests?: number | null; reference?: string | null;
  overdue_booking_id?: string | null; overdue_guest?: string | null;
};
type Filter = 'all' | 'free' | 'occupied' | 'problems';

/** Mulige problemer i et værelse: overskredet check ud eller en status, der ikke passer til gæsten. */
export function roomProblems(r: Room): string[] {
  const out: string[] = [];
  if (r.overdue_booking_id) out.push(`Check ud-tiden er overskredet (${r.overdue_guest ?? 'gæst'} er ikke tjekket ud)`);
  if (r.housekeeping_status === 'occupied' && !r.guest_name && !r.overdue_booking_id) out.push('Status er "Gæst på værelset", men der bor ingen gæst');
  return out;
}
const isOccupied = (r: Room) => !!r.guest_name || !!r.overdue_booking_id;
const matches = (r: Room, f: Filter) => f === 'all' || (f === 'free' ? !isOccupied(r) : f === 'occupied' ? isOccupied(r) : roomProblems(r).length > 0);

type Detail = {
  room: { number: string; floor: number; capacity: number; housekeeping_status: HousekeepingStatus; rate_cents: number };
  stay: { id: string; reference: string; guest_name: string; guest_email: string | null; guests: number; starts_at: string; ends_at: string; checked_in_at: string | null; overdue: boolean; nights: number; devices: number; devices_max: number; last_seen_at: string | null } | null;
  bill: { total_cents: number; paid_cents: number; due_cents: number; items: number } | null;
  orders: { id: string; type: string; details: string; status: OrderStatus; quantity: number; total_cents: number; created_at: string }[];
  cleaning: { id: string; status: CleaningStatus; kind: string; created_at: string; away_from: string | null; away_until: string | null }[];
  next_booking: { id: string; guest_name: string; reference: string; guests: number; starts_at: string; ends_at: string } | null;
  last_checkout: { guest_name: string; reference: string; checked_out_at: string } | null;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium">{children}</dd></div>;
}

/** Alt om ét værelse: lejeperiode, gæster, adgang i appen, rengøringsstatus, regning, åbne ordrer og opgaver samt næste og seneste gæst. */
function RoomPanel({ number, problems, onClose, onChanged }: { number: string; problems: string[]; onClose: () => void; onChanged: () => void }) {
  const act = useAct();
  const { openBill, openGuest, openCheckout, go } = useStaff();
  const { data: d, error, reload } = useStaffData<Detail>('staff_room_detail', { _room: number }, 10000);
  const now = Date.now();
  async function setStatus(status: HousekeepingStatus) {
    const res = await act('staff_set_room_status', { _room: number, _status: status }, `Værelse ${number}: ${HOUSEKEEPING_LABELS[status]}`);
    if (res.ok) { await reload(); onChanged(); }
  }
  const st = d?.stay;
  const open = (f: () => void) => { onClose(); f(); };
  return (
    <Sheet open onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetTitle className="font-display text-4xl">Værelse {number}</SheetTitle>
        <SheetDescription>{d ? `${d.room.floor}. sal · plads til ${d.room.capacity} · ${st ? (st.overdue ? 'Check ud-tiden er overskredet' : 'Optaget') : 'Ledigt'}` : error ?? 'Henter…'}</SheetDescription>
        {d && (
          <div className="mt-5 space-y-5">
            {problems.length > 0 && (
              <div role="alert" className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                {problems.map(p => <p key={p} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />{p}</p>)}
              </div>
            )}

            <section className={card}>
              <h3 className="flex items-center gap-2 text-lg"><BedDouble className="h-4 w-4 text-brass" />Lejeperiode</h3>
              {st ? (
                <>
                  <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <Row label="Gæst">{st.guest_name}</Row>
                    <Row label="Booking">{st.reference}</Row>
                    <Row label="Lejet ud fra">{dayTime(st.starts_at)}</Row>
                    <Row label="Til">{dayTime(st.ends_at)}</Row>
                    <Row label="Varighed">{st.nights} {st.nights === 1 ? 'nat' : 'nætter'}</Row>
                    <Row label={st.overdue ? 'Overskredet' : 'Tid tilbage'}>{relativeTime(Date.parse(st.ends_at) - now).replace(/^om /, '').replace(' siden', '')}{st.overdue ? ' siden check ud-tiden' : ''}</Row>
                    <Row label="Tjekket ind">{st.checked_in_at ? dayTime(st.checked_in_at) : 'Ikke tjekket ind endnu'}</Row>
                    <Row label="E-mail">{st.guest_email ?? '–'}</Row>
                  </dl>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="flex items-center gap-3 rounded-lg bg-secondary/60 px-3 py-2"><Users className="h-4 w-4 text-brass" /><div><p className="text-xs text-muted-foreground">Gæster på værelset</p><p className="font-semibold">{st.guests} af {d.room.capacity}</p></div></div>
                    <div className="flex items-center gap-3 rounded-lg bg-secondary/60 px-3 py-2"><Smartphone className="h-4 w-4 text-brass" /><div><p className="text-xs text-muted-foreground">Adgang i appen</p><p className="font-semibold">{st.devices} af {st.devices_max} enheder{st.last_seen_at ? ` · aktiv ${relativeTime(Date.parse(st.last_seen_at) - now)}` : ''}</p></div></div>
                  </div>
                  <div className="mt-3"><Button size="sm" variant="outline" onClick={() => open(() => openGuest(st.id))}><Info />Gæsteinfo</Button></div>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Ingen gæst på værelset lige nu.</p>
              )}
              {d.next_booking && <p className="mt-3 border-t pt-3 text-sm"><span className="text-muted-foreground">Næste ankomst: </span><b>{d.next_booking.guest_name}</b> · {dayTime(d.next_booking.starts_at)} – {dayTime(d.next_booking.ends_at)} · {d.next_booking.guests} {d.next_booking.guests === 1 ? 'gæst' : 'gæster'}</p>}
              {d.last_checkout && <p className="mt-2 text-sm"><span className="text-muted-foreground">Seneste gæst: </span>{d.last_checkout.guest_name} · tjekket ud {dayTime(d.last_checkout.checked_out_at)}</p>}
            </section>

            <section className={card}>
              <h3 className="text-lg">Rengøring</h3>
              <p className="mt-1 text-xs text-muted-foreground">Skift status, når værelset er rengjort eller har brug for det.</p>
              <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Rengøringsstatus">
                {(Object.keys(HOUSEKEEPING_LABELS) as HousekeepingStatus[]).map(s => (
                  <Button key={s} type="button" role="radio" aria-checked={d.room.housekeeping_status === s} variant={d.room.housekeeping_status === s ? 'default' : 'outline'} className="h-auto justify-start gap-2 whitespace-normal py-2 text-left" onClick={() => d.room.housekeeping_status !== s && setStatus(s)}>
                    {d.room.housekeeping_status === s && <Check />}{HOUSEKEEPING_LABELS[s]}
                  </Button>
                ))}
              </div>
              {d.cleaning.length > 0 && (
                <div className="mt-3 border-t pt-3 text-sm">
                  <p className="font-medium">Åbne rengøringsopgaver</p>
                  <ul className="mt-1 divide-y">{d.cleaning.map(c => <li key={c.id} className="flex justify-between gap-3 py-1.5"><span>{c.kind === 'checkout' ? 'Afrejse-rengøring' : 'Bestilt af gæsten'}{c.away_from && c.away_until ? ` · væk ${hm(c.away_from)}–${hm(c.away_until)}` : ''}</span><span className="text-muted-foreground">{CLEANING_LABELS[c.status]} · {hm(c.created_at)}</span></li>)}</ul>
                  <Button size="sm" variant="ghost" className="mt-1" onClick={() => open(() => go('tasks'))}>Gå til opgaver</Button>
                </div>
              )}
            </section>

            <section className={card}>
              <h3 className="flex items-center gap-2 text-lg"><Receipt className="h-4 w-4 text-brass" />Regning</h3>
              {d.bill && st ? (
                <>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-secondary p-2"><p className="text-xs text-muted-foreground">Samlet</p><p className="font-display text-xl tabular-nums">{fmtDKK(d.bill.total_cents)}</p></div>
                    <div className="rounded-lg bg-secondary p-2"><p className="text-xs text-muted-foreground">Betalt</p><p className="font-display text-xl tabular-nums">{fmtDKK(d.bill.paid_cents)}</p></div>
                    <div className="rounded-lg bg-secondary p-2"><p className="text-xs text-muted-foreground">Til betaling</p><p className="font-display text-xl tabular-nums">{fmtDKK(d.bill.due_cents)}</p></div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => open(() => openBill(st.id))}><Receipt />Åbn regning ({d.bill.items} {d.bill.items === 1 ? 'post' : 'poster'})</Button>
                    {st.overdue && <Button size="sm" onClick={() => open(() => openCheckout(st.id))}><LogOut />Tjek ud</Button>}
                  </div>
                </>
              ) : <p className="mt-2 text-sm text-muted-foreground">Ingen regning, da der ikke bor nogen gæst på værelset.</p>}
            </section>

            {d.orders.length > 0 && (
              <section className={card}>
                <h3 className="text-lg">Åbne ordrer</h3>
                <ul className="mt-1 divide-y text-sm">{d.orders.map(o => <li key={o.id} className="flex items-start justify-between gap-3 py-2"><span className="min-w-0 break-words">{o.type === 'towels' ? `${o.quantity} håndklæder` : o.details}{o.total_cents ? <span className="block text-xs text-muted-foreground">{fmtDKK(o.total_cents)}</span> : null}</span><span className="shrink-0 text-xs text-muted-foreground">{ORDER_LABELS[o.status]} · {hm(o.created_at)}</span></li>)}</ul>
                <Button size="sm" variant="ghost" className="mt-1" onClick={() => open(() => go(d.orders.some(o => o.type === 'towels') && !d.orders.some(o => o.type !== 'towels') ? 'tasks' : 'orders', d.orders.some(o => o.type === 'towels') && !d.orders.some(o => o.type !== 'towels') ? 'towels' : undefined))}>Gå til ordrer</Button>
              </section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Værelser: ensartede felter med nummer (og gæstens navn). Klik på et værelse for at se alt om det. */
export function RoomsPage() {
  const { data, error, reload } = useStaffData<Room[]>('staff_rooms', {}, 10000);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [openNumber, setOpenNumber] = useState<string | null>(null);
  const [folded, setFolded] = useState<Record<number, boolean>>({});
  const rooms = data ?? [];
  const counts: Record<Filter, number> = { all: rooms.length, free: rooms.filter(r => !isOccupied(r)).length, occupied: rooms.filter(isOccupied).length, problems: rooms.filter(r => roomProblems(r).length > 0).length };
  const shown = useMemo(() => rooms.filter(r => matches(r, filter) && `${r.number} ${r.guest_name ?? ''} ${r.overdue_guest ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())), [rooms, filter, q]);
  const floors = [...new Set(shown.map(r => r.floor))].sort((a, b) => a - b);
  const open = rooms.find(r => r.number === openNumber) ?? null;
  const filters: [Filter, string][] = [['all', 'Alle'], ['free', 'Ledige'], ['occupied', 'Optagede'], ['problems', 'Problemer']];
  return (
    <>
      <PageTitle title="Værelser" hint="Tryk på et værelse for at se alt om det: lejeperiode, gæster, rengøring, regning og ordrer." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer værelser">
          {filters.map(([f, l]) => (
            <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {l}<span className="ml-1 tabular-nums opacity-70">{counts[f]}</span>
            </Button>
          ))}
        </div>
        <label className="relative ml-auto block w-full min-w-48 sm:w-64"><span className="sr-only">Søg værelse eller gæst</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Søg værelse eller gæst" className={`${field} pl-9`} /></label>
      </div>
      {!data && <p className="py-10 text-center text-sm text-muted-foreground">{error ?? 'Henter værelser…'}</p>}
      {data && shown.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Ingen værelser matcher.</p>}
      <div className="space-y-3">
        {floors.map(f => {
          const list = shown.filter(r => r.floor === f), isFolded = folded[f] ?? false;
          return (
            <section key={f} className="rounded-xl border bg-card/40">
              <button type="button" aria-expanded={!isFolded} onClick={() => setFolded(x => ({ ...x, [f]: !isFolded }))} className="flex w-full items-center gap-3 px-3 py-2 text-left">
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isFolded ? '-rotate-90' : ''}`} />
                <span className="text-lg">{f}. sal</span>
                <span className="ml-auto text-xs text-muted-foreground">{list.filter(isOccupied).length} optaget · {list.filter(r => !isOccupied(r)).length} ledige</span>
              </button>
              {!isFolded && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2 p-2 pt-0">
                  {list.map(r => {
                    const guest = r.guest_name ?? r.overdue_guest;
                    const problem = roomProblems(r).length > 0;
                    return (
                      <button key={r.number} type="button" onClick={() => setOpenNumber(r.number)} aria-label={`Værelse ${r.number}${guest ? `, ${guest}` : ', ledigt'}${problem ? ', har et problem' : ''}`}
                        className="flex min-h-[3.75rem] flex-col rounded-lg border bg-card px-2.5 py-1.5 text-left shadow-sm transition hover:bg-accent">
                        <span className="flex items-center justify-between gap-1"><span className="font-display text-xl leading-none">{r.number}</span>{problem && <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-hidden />}</span>
                        <span className="mt-1 truncate text-xs text-muted-foreground">{guest ?? 'Ledigt'}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {open && <RoomPanel key={open.number} number={open.number} problems={roomProblems(open)} onClose={() => setOpenNumber(null)} onChanged={() => void reload()} />}
    </>
  );
}
