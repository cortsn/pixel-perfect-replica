import { BedDouble, Clock, DoorOpen, Mail, Smartphone, UserRound, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { HOUSEKEEPING_LABELS, type HousekeepingStatus } from '@/lib/hotel';
import { card, dayTime, useStaffData } from '@/components/staff/core';
import { relativeTime } from '@/components/staff/guests';

type Info = {
  booking: { id: string; reference: string; guest_name: string; guest_email: string | null; guests: number; room_number: string; starts_at: string; ends_at: string; checked_in_at: string | null; checked_out_at: string | null; breakfast_choice: string | null; lunch_choice: string | null; dinner_choice: string | null };
  room: { number: string; floor: number; capacity: number; housekeeping_status: HousekeepingStatus };
  devices: { count: number; max: number; items: { id: string; created_at: string; last_seen_at: string | null; last_unlock_at: string | null; unlock_count: number }[] };
  activity: { orders_total: number; orders_open: number; cleaning_requests: number; unlocks: number; last_seen_at: string | null; timeline: { at: string; kind: string; text: string }[] };
};
const MEALS: [keyof Info['booking'], string][] = [['breakfast_choice', 'Morgenmad'], ['lunch_choice', 'Frokost'], ['dinner_choice', 'Aftensmad']];
const choiceText = (c: string | null) => (c === 'hotel' ? 'på hotellet' : c === 'out' ? 'ude' : 'ikke svaret');
const ago = (iso: string | null) => (iso ? relativeTime(Date.parse(iso) - Date.now()) : 'aldrig');

/** Information om gæsten og værelset: personer, adgang i appen og aktivitet. Ingen regning og ingen tjek ind/ud her. */
export function GuestInfoDialog({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const { data, error } = useStaffData<Info>('staff_guest_info', { _booking: bookingId }, 10000);
  const b = data?.booking;
  const status = !b ? '' : b.checked_out_at ? 'Tjekket ud' : Date.parse(b.ends_at) <= Date.now() ? 'Check ud-tiden er overskredet' : Date.parse(b.starts_at) > Date.now() ? 'Ankommer' : b.checked_in_at ? 'Tjekket ind' : 'Ikke tjekket ind';
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent aria-describedby="gi-desc" className="max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-2xl p-5 sm:p-6">
        <div>
          <DialogTitle className="flex items-center gap-2 text-2xl"><UserRound className="h-5 w-5 text-brass" />{b?.guest_name ?? 'Gæst'}</DialogTitle>
          <DialogDescription id="gi-desc" className="mt-1">{b ? `Værelse ${b.room_number} · ${b.reference} · ${status}` : error ?? 'Henter…'}</DialogDescription>
        </div>
        {data && b && (
          <div className="space-y-5">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className={`${card} flex items-start gap-3`}><Users className="mt-1 h-5 w-5 text-brass" /><div><p className="text-xs text-muted-foreground">Personer på værelset</p><p className="font-display text-3xl leading-none tabular-nums">{b.guests}</p><p className="mt-1 text-xs text-muted-foreground">plads til {data.room.capacity}</p></div></div>
              <div className={`${card} flex items-start gap-3`}><Smartphone className="mt-1 h-5 w-5 text-brass" /><div><p className="text-xs text-muted-foreground">Adgang i appen</p><p className="font-display text-3xl leading-none tabular-nums">{data.devices.count}<span className="text-lg text-muted-foreground"> / {data.devices.max}</span></p><p className="mt-1 text-xs text-muted-foreground">enheder tilknyttet</p></div></div>
              <div className={`${card} flex items-start gap-3`}><Clock className="mt-1 h-5 w-5 text-brass" /><div><p className="text-xs text-muted-foreground">Sidst aktiv i appen</p><p className="text-lg font-semibold leading-tight">{data.activity.last_seen_at ? ago(data.activity.last_seen_at) : 'Ikke åbnet endnu'}</p></div></div>
            </div>

            <section className={card}>
              <h3 className="flex items-center gap-2 text-lg"><BedDouble className="h-4 w-4 text-brass" />Gæst og værelse</h3>
              <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-muted-foreground">Navn</dt><dd className="font-medium">{b.guest_name}</dd></div>
                <div><dt className="text-xs text-muted-foreground">E-mail</dt><dd className="flex items-center gap-1.5 font-medium">{b.guest_email ? <><Mail className="h-3.5 w-3.5 text-muted-foreground" />{b.guest_email}</> : '–'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Værelse</dt><dd className="font-medium">{b.room_number} · {data.room.floor}. sal · {HOUSEKEEPING_LABELS[data.room.housekeeping_status]}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Booking</dt><dd className="font-medium">{b.reference}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Check ind</dt><dd className="font-medium">{dayTime(b.starts_at)}{b.checked_in_at ? ` (tjekket ind ${dayTime(b.checked_in_at)})` : ''}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Check ud</dt><dd className="font-medium">{dayTime(b.ends_at)}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">Tider ændres under Gæster & ophold → Reservationer & tider. Tjek ind og ud sker under Ankomster & afrejser.</p>
            </section>

            <section className={card}>
              <h3 className="flex items-center gap-2 text-lg"><Smartphone className="h-4 w-4 text-brass" />Enheder med adgang</h3>
              {data.devices.items.length === 0
                ? <p className="mt-2 text-sm text-muted-foreground">Ingen har åbnet appen til værelset endnu. Der er plads til {data.devices.max} enheder.</p>
                : <ul className="mt-2 divide-y text-sm">{data.devices.items.map((d, i) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span><b>Enhed {i + 1}</b><span className="block text-xs text-muted-foreground">Tilknyttet {dayTime(d.created_at)}</span></span>
                    <span className="text-right text-xs text-muted-foreground">Sidst aktiv: {ago(d.last_seen_at)}<span className="block">{d.unlock_count > 0 ? `Låst døren op ${d.unlock_count} ${d.unlock_count === 1 ? 'gang' : 'gange'}` : 'Ikke låst døren op'}</span></span>
                  </li>))}</ul>}
            </section>

            <section className={card}>
              <h3 className="flex items-center gap-2 text-lg"><DoorOpen className="h-4 w-4 text-brass" />Aktivitet</h3>
              <ul className="mt-2 grid grid-cols-3 gap-2 text-sm" aria-label="Opsummering">
                <li className="rounded-lg bg-secondary p-2 text-center"><span className="block font-display text-2xl tabular-nums">{data.activity.orders_total}</span>ordrer{data.activity.orders_open > 0 ? ` (${data.activity.orders_open} åbne)` : ''}</li>
                <li className="rounded-lg bg-secondary p-2 text-center"><span className="block font-display text-2xl tabular-nums">{data.activity.cleaning_requests}</span>rengøringer</li>
                <li className="rounded-lg bg-secondary p-2 text-center"><span className="block font-display text-2xl tabular-nums">{data.activity.unlocks}</span>oplåsninger</li>
                
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">Måltider: {MEALS.map(([k, l]) => `${l} ${choiceText(b[k] as string | null)}`).join(' · ')}</p>
              {data.activity.timeline.length === 0
                ? <p className="mt-3 text-sm text-muted-foreground">Ingen aktivitet endnu.</p>
                : <ul className="mt-3 max-h-56 divide-y overflow-y-auto text-sm">{data.activity.timeline.map((t, i) => <li key={i} className="flex justify-between gap-3 py-1.5"><span className="min-w-0 break-words">{t.text}</span><span className="shrink-0 text-xs text-muted-foreground">{dayTime(t.at)}</span></li>)}</ul>}
            </section>
          </div>
        )}
        <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Luk</Button></div>
      </DialogContent>
    </Dialog>
  );
}
