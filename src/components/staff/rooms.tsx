import { useState } from 'react';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { HOUSEKEEPING_LABELS, type HousekeepingStatus } from '@/lib/hotel';
import { centsToInput, fmtDKK, parseDKK } from '@/lib/money';
import { PageTitle, card, dayTime, field, useAct, useStaff, useStaffData } from '@/components/staff/core';

type Room = { number: string; floor: number; capacity: number; housekeeping_status: HousekeepingStatus; rate_cents: number; guest_name: string | null; booking_id: string | null; ends_at: string | null };
const TONE: Record<HousekeepingStatus, string> = { occupied: 'bg-primary/15 text-primary', needs_cleaning: 'bg-status-dirty/15 text-status-dirty', cleaning: 'bg-status-cleaning/25 text-foreground', clean: 'bg-status-clean/15 text-status-clean' };

function RoomCard({ r, onChanged }: { r: Room; onChanged: () => void }) {
  const act = useAct();
  const { openBill } = useStaff();
  const [rate, setRate] = useState(centsToInput(r.rate_cents));
  const dirty = parseDKK(rate) !== r.rate_cents;
  async function saveRate() {
    const cents = parseDKK(rate);
    if (cents === null || cents < 0) { toast.error('Skriv en gyldig pris pr. nat.'); return; }
    const res = await act('staff_room_rate_set', { _room: r.number, _cents: cents }, `Værelse ${r.number}: prisen er gemt`);
    if (res.ok) onChanged();
  }
  async function setStatus(status: string) {
    const res = await act('staff_set_room_status', { _room: r.number, _status: status }, `Værelse ${r.number}: ${HOUSEKEEPING_LABELS[status as HousekeepingStatus]}`);
    if (res.ok) onChanged();
  }
  return (
    <article className={card}>
      <div className="flex items-start justify-between gap-2">
        <div><p className="font-display text-3xl leading-none">{r.number}</p><p className="mt-1 text-xs text-muted-foreground">Plads til {r.capacity}</p></div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[r.housekeeping_status]}`}>{HOUSEKEEPING_LABELS[r.housekeeping_status]}</span>
      </div>
      <p className="mt-3 min-h-10 text-sm">{r.guest_name ? <><b>{r.guest_name}</b><span className="block text-xs text-muted-foreground">til {dayTime(r.ends_at!)}</span></> : <span className="text-muted-foreground">Ledigt lige nu</span>}</p>
      <label className="mt-3 block text-xs text-muted-foreground">Status
        <select aria-label={`Status for værelse ${r.number}`} className={`${field} mt-1`} value={r.housekeeping_status} onChange={e => setStatus(e.target.value)}>
          {(Object.keys(HOUSEKEEPING_LABELS) as HousekeepingStatus[]).map(s => <option key={s} value={s}>{HOUSEKEEPING_LABELS[s]}</option>)}
        </select>
      </label>
      <div className="mt-3 flex items-end gap-2">
        <label className="min-w-0 flex-1 text-xs text-muted-foreground">Pris pr. nat (kr)<input aria-label={`Pris for værelse ${r.number}`} inputMode="decimal" className={`${field} mt-1`} value={rate} onChange={e => setRate(e.target.value)} /></label>
        <Button size="sm" variant={dirty ? 'default' : 'outline'} disabled={!dirty} onClick={saveRate}><Check />Gem</Button>
      </div>
      {r.rate_cents === 0 && <p className="mt-1 text-xs text-muted-foreground">Uden pris kan overnatning ikke lægges på regningen.</p>}
      {r.booking_id && <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => openBill(r.booking_id!)}>Regning ({r.rate_cents ? fmtDKK(r.rate_cents) + '/nat' : 'se poster'})</Button>}
    </article>
  );
}

/** Værelser: status, nuværende gæst og pris pr. nat. */
export function RoomsPage() {
  const { data, error, reload } = useStaffData<Room[]>('staff_rooms', {}, 10000);
  const floors = [...new Set((data ?? []).map(r => r.floor))].sort((a, b) => a - b);
  return (
    <>
      <PageTitle title="Værelser" hint="Status og priser. Prisen bruges til overnatning på regningen." />
      {!data && <p className="py-10 text-center text-sm text-muted-foreground">{error ?? 'Henter værelser…'}</p>}
      {floors.map(f => (
        <section key={f} className="mb-6">
          <h2 className="mb-2 text-xl">{f}. sal</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data!.filter(r => r.floor === f).map(r => <RoomCard key={`${r.number}-${r.rate_cents}-${r.housekeeping_status}`} r={r} onChanged={() => void reload()} />)}</div>
        </section>
      ))}
    </>
  );
}
