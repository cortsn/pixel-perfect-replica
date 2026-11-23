import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { HOUSEKEEPING_LABELS, type HousekeepingStatus } from '@/lib/hotel';
import { PageTitle, dayTime, field, useAct, useStaff, useStaffData } from '@/components/staff/core';

export type Room = {
  number: string; floor: number; capacity: number; housekeeping_status: HousekeepingStatus; rate_cents: number;
  guest_name: string | null; booking_id: string | null; ends_at: string | null; guests?: number | null; reference?: string | null;
  overdue_booking_id?: string | null; overdue_guest?: string | null;
};
type Filter = 'all' | 'free' | 'occupied' | 'cleaning' | 'problems';

const DOT: Record<HousekeepingStatus, string> = { occupied: 'bg-primary', needs_cleaning: 'bg-status-dirty', cleaning: 'bg-status-cleaning', clean: 'bg-status-clean' };
const EDGE: Record<HousekeepingStatus, string> = { occupied: 'border-l-primary', needs_cleaning: 'border-l-status-dirty', cleaning: 'border-l-status-cleaning', clean: 'border-l-status-clean' };

/** Mulige problemer i et værelse: overskredet check ud eller en status, der ikke passer til gæsten. */
export function roomProblems(r: Room): string[] {
  const out: string[] = [];
  if (r.overdue_booking_id) out.push(`Check ud-tiden er overskredet (${r.overdue_guest ?? 'gæst'} er ikke tjekket ud)`);
  if (r.housekeeping_status === 'occupied' && !r.guest_name && !r.overdue_booking_id) out.push('Status er "Gæst på værelset", men der bor ingen gæst');
  return out;
}
const isOccupied = (r: Room) => !!r.guest_name || !!r.overdue_booking_id;
const isCleaning = (r: Room) => r.housekeeping_status === 'needs_cleaning' || r.housekeeping_status === 'cleaning';
const isFree = (r: Room) => !isOccupied(r) && r.housekeeping_status === 'clean';
const matches = (r: Room, f: Filter) => f === 'all' || (f === 'free' ? isFree(r) : f === 'occupied' ? isOccupied(r) : f === 'cleaning' ? isCleaning(r) : roomProblems(r).length > 0);

function RoomTile({ r, onOpen }: { r: Room; onOpen: () => void }) {
  const problems = roomProblems(r);
  const guest = r.guest_name ?? r.overdue_guest;
  return (
    <button type="button" onClick={onOpen} aria-label={`Værelse ${r.number}, ${HOUSEKEEPING_LABELS[r.housekeeping_status]}${guest ? `, ${guest}` : ''}`}
      className={`flex min-h-[3.75rem] flex-col rounded-lg border border-l-4 bg-card px-2.5 py-1.5 text-left shadow-sm transition hover:bg-accent ${EDGE[r.housekeeping_status]} ${problems.length ? 'ring-1 ring-destructive/60' : ''}`}>
      <span className="flex items-center justify-between gap-1">
        <span className="font-display text-xl leading-none">{r.number}</span>
        {problems.length > 0 && <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-label="Problem" />}
        <span className={`h-2.5 w-2.5 rounded-full ${DOT[r.housekeeping_status]}`} title={HOUSEKEEPING_LABELS[r.housekeeping_status]} />
      </span>
      <span className="mt-1 truncate text-xs text-muted-foreground">{guest ?? HOUSEKEEPING_LABELS[r.housekeeping_status]}</span>
    </button>
  );
}

/** Sidepanel med detaljer for ét værelse: gæst, status og problemer. */
function RoomPanel({ room, onClose, onChanged }: { room: Room; onClose: () => void; onChanged: () => void }) {
  const act = useAct();
  const { openBill, openCheckout } = useStaff();
  const problems = roomProblems(room);
  async function setStatus(status: HousekeepingStatus) {
    const res = await act('staff_set_room_status', { _room: room.number, _status: status }, `Værelse ${room.number}: ${HOUSEKEEPING_LABELS[status]}`);
    if (res.ok) onChanged();
  }
  const bookingId = room.booking_id ?? room.overdue_booking_id ?? null;
  return (
    <Sheet open onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetTitle className="font-display text-4xl">Værelse {room.number}</SheetTitle>
        <SheetDescription>{room.floor}. sal · plads til {room.capacity}</SheetDescription>
        <div className="mt-5 space-y-6">
          {problems.length > 0 && (
            <div role="alert" className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              {problems.map(p => <p key={p} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />{p}</p>)}
            </div>
          )}
          <section>
            <h3 className="text-lg">Gæst</h3>
            {room.guest_name
              ? <p className="mt-1 text-sm"><b>{room.guest_name}</b>{room.guests ? ` · ${room.guests} ${room.guests === 1 ? 'gæst' : 'gæster'}` : ''}<span className="block text-muted-foreground">{room.reference} · check ud {dayTime(room.ends_at!)}</span></p>
              : room.overdue_booking_id
                ? <p className="mt-1 text-sm"><b>{room.overdue_guest}</b><span className="block text-muted-foreground">Check ud-tiden er overskredet. Tjek gæsten ud.</span></p>
                : <p className="mt-1 text-sm text-muted-foreground">Ledigt lige nu.</p>}
            {bookingId && <div className="mt-3 flex gap-2"><Button className="flex-1" variant="outline" onClick={() => { onClose(); openBill(bookingId); }}>Åbn regning</Button>{room.overdue_booking_id && !room.guest_name && <Button className="flex-1" onClick={() => { onClose(); openCheckout(bookingId); }}>Tjek ud</Button>}</div>}
          </section>
          <section>
            <h3 className="text-lg">Status</h3>
            <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Rengøringsstatus">
              {(Object.keys(HOUSEKEEPING_LABELS) as HousekeepingStatus[]).map(s => (
                <Button key={s} type="button" role="radio" aria-checked={room.housekeeping_status === s} variant={room.housekeeping_status === s ? 'default' : 'outline'} className="h-auto justify-start gap-2 whitespace-normal py-2 text-left" onClick={() => room.housekeeping_status !== s && setStatus(s)}>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[s]} ring-1 ring-background`} />{HOUSEKEEPING_LABELS[s]}
                </Button>
              ))}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Værelser: kompakt overblik pr. etage med filtre og søgning. Klik på et værelse for detaljer. */
export function RoomsPage() {
  const { data, error, reload } = useStaffData<Room[]>('staff_rooms', {}, 10000);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [openNumber, setOpenNumber] = useState<string | null>(null);
  const [folded, setFolded] = useState<Record<number, boolean>>({});
  const rooms = data ?? [];
  const counts: Record<Filter, number> = { all: rooms.length, free: rooms.filter(isFree).length, occupied: rooms.filter(isOccupied).length, cleaning: rooms.filter(isCleaning).length, problems: rooms.filter(r => roomProblems(r).length > 0).length };
  const shown = useMemo(() => rooms.filter(r => matches(r, filter) && `${r.number} ${r.guest_name ?? ''} ${r.overdue_guest ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())), [rooms, filter, q]);
  const floors = [...new Set(shown.map(r => r.floor))].sort((a, b) => a - b);
  const open = rooms.find(r => r.number === openNumber) ?? null;
  const filters: [Filter, string][] = [['all', 'Alle'], ['free', 'Ledige'], ['occupied', 'Optagede'], ['cleaning', 'Rengøring'], ['problems', 'Problemer']];
  return (
    <>
      <PageTitle title="Værelser" hint="Tryk på et værelse for at se og ændre status og gæst." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer værelser">
          {filters.map(([f, l]) => (
            <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} aria-pressed={filter === f} onClick={() => setFilter(f)} className={f === 'problems' && counts.problems > 0 && filter !== f ? 'border-destructive/60 text-destructive' : ''}>
              {l}<span className="ml-1 tabular-nums opacity-70">{counts[f]}</span>
            </Button>
          ))}
        </div>
        <label className="relative ml-auto block w-full min-w-48 sm:w-64"><span className="sr-only">Søg værelse eller gæst</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Søg værelse eller gæst" className={`${field} pl-9`} /></label>
      </div>
      <p className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Forklaring">
        {(Object.keys(HOUSEKEEPING_LABELS) as HousekeepingStatus[]).map(s => <span key={s} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${DOT[s]}`} />{HOUSEKEEPING_LABELS[s]}</span>)}
        <span className="flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 text-destructive" />Problem</span>
      </p>
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
                <span className="ml-auto text-xs text-muted-foreground">{list.filter(isOccupied).length} optaget · {list.filter(isFree).length} ledige · {list.filter(isCleaning).length} rengøring{list.some(r => roomProblems(r).length) ? ` · ${list.filter(r => roomProblems(r).length).length} problem` : ''}</span>
              </button>
              {!isFolded && <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2 p-2 pt-0">{list.map(r => <RoomTile key={r.number} r={r} onOpen={() => setOpenNumber(r.number)} />)}</div>}
            </section>
          );
        })}
      </div>
      {open && <RoomPanel key={open.number} room={open} onClose={() => setOpenNumber(null)} onChanged={() => void reload()} />}
    </>
  );
}
