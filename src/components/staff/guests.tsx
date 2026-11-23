import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmtDKK } from '@/lib/money';
import { PageTitle, card, dayTime, field, hm, useAct, useStaff, useStaffData } from '@/components/staff/core';
import { ReservationsPage } from '@/components/staff/reservations';

export type GuestRow = { id: string; reference: string; room_number: string; guest_name: string; guest_email: string | null; guests: number; starts_at: string; ends_at: string; checked_in_at: string | null; balance_cents: number; in_house: boolean; overdue?: boolean };
type Filter = 'all' | 'arriving' | 'in' | 'departing';

const sameDay = (iso: string, now = new Date()) => new Date(iso).toDateString() === now.toDateString();
/** Ankommer: opholdet er ikke startet. Boende: opholdet er i gang. Tjekker ud: slutter i dag, eller check ud-tiden er overskredet. */
export const isArriving = (g: GuestRow) => !g.in_house && !g.overdue;
export const isDeparting = (g: GuestRow) => !!g.overdue || (g.in_house && sameDay(g.ends_at));

/** Gæster der bor på hotellet eller er på vej, med saldo og genvej til regning/checkout. */
export function GuestsPage() {
  const { openBill } = useStaff();
  const { data, error, reload } = useStaffData<GuestRow[]>('staff_guests', {}, 8000);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const all = data ?? [];
  const counts = { arriving: all.filter(isArriving).length, in: all.filter(g => g.in_house).length, departing: all.filter(isDeparting).length };
  const rows = useMemo(() => all.filter(g => {
    const match = filter === 'all' || (filter === 'arriving' ? isArriving(g) : filter === 'in' ? g.in_house : isDeparting(g));
    return match && `${g.guest_name} ${g.room_number} ${g.reference}`.toLowerCase().includes(q.trim().toLowerCase());
  }), [all, q, filter]);
  const filters: [Filter, string][] = [['all', `Alle (${all.length})`], ['arriving', `Ankommer (${counts.arriving})`], ['in', `Boende (${counts.in})`], ['departing', `Tjekker ud (${counts.departing})`]];
  return (
    <>
      <PageTitle title="Gæster" hint={`${counts.in} bor på hotellet · ${counts.arriving} på vej · ${counts.departing} tjekker ud`} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative block min-w-56 flex-1 sm:max-w-sm"><span className="sr-only">Søg gæst</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Søg navn, værelse eller booking" className={`${field} pl-9`} /></label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Vis">
          {filters.map(([f, l]) => <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} aria-pressed={filter === f} onClick={() => setFilter(f)}>{l}</Button>)}
        </div>
      </div>
      <div className={`${card} overflow-x-auto p-0`}>
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b text-muted-foreground"><tr>{['Værelse', 'Gæst', 'Ophold', 'Status', 'Saldo', ''].map(h => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody className="divide-y">
            {rows.map(g => (
              <tr key={g.id}>
                <td className="px-4 py-3 font-display text-2xl">{g.room_number}</td>
                <td className="px-4 py-3"><span className="font-semibold">{g.guest_name}</span><span className="block text-xs text-muted-foreground">{g.reference} · {g.guests} {g.guests === 1 ? 'gæst' : 'gæster'}</span></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{dayTime(g.starts_at)}<br />{dayTime(g.ends_at)}</td>
                <td className="px-4 py-3">
                  {g.overdue
                    ? <span className="rounded-full bg-status-dirty/15 px-2 py-0.5 text-xs font-semibold text-status-dirty">Skal tjekkes ud</span>
                    : <span className={`rounded-full px-2 py-0.5 text-xs ${g.in_house ? 'bg-status-clean/15 text-status-clean' : 'bg-secondary'}`}>{g.in_house ? (isDeparting(g) ? 'Tjekker ud i dag' : g.checked_in_at ? 'Tjekket ind' : 'Ikke tjekket ind') : 'Ankommer'}</span>}
                </td>
                <td className="px-4 py-3 tabular-nums">{fmtDKK(g.balance_cents)}</td>
                <td className="px-4 py-3 text-right"><Button size="sm" variant={g.in_house || g.overdue ? 'default' : 'outline'} onClick={() => openBill(g.id)}>{g.in_house || g.overdue ? 'Regning / tjek ud' : 'Regning'}</Button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">{error ?? (data ? 'Ingen gæster matcher' : 'Henter…')}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground"><button type="button" className="underline" onClick={() => void reload()}>Opdater</button> · Afrejste gæster finder du under Salg → Historik.</p>
    </>
  );
}

type Window = 'soon' | 'today' | 'all';
const WINDOWS: [Window, string][] = [['soon', 'Næste 2 timer'], ['today', 'I dag'], ['all', 'Alle']];
const TWO_HOURS = 2 * 3600e3;

/** "om 1 t 20 min", "om 12 min", "for 15 min siden" eller "nu". */
export function relativeTime(ms: number): string {
  const min = Math.round(Math.abs(ms) / 60000);
  if (min < 1) return 'nu';
  const t = min >= 60 ? `${Math.floor(min / 60)} t${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`;
  return ms > 0 ? `om ${t}` : `for ${t} siden`;
}

/** Skal gæsten tjekkes ind inden for vinduet? Ikke tjekket ind endnu, og starten ligger inden for vinduet (eller er allerede passeret). */
export const arrivalDue = (g: GuestRow, w: Window, now: number) => !g.checked_in_at && !g.overdue && (w === 'all' || (w === 'today' ? Date.parse(g.starts_at) <= now || sameDay(g.starts_at, new Date(now)) : Date.parse(g.starts_at) <= now + TWO_HOURS));
/** Skal gæsten tjekkes ud inden for vinduet? Slutter inden for vinduet, eller check ud-tiden er overskredet. */
export const departureDue = (g: GuestRow, w: Window, now: number) => (g.in_house || !!g.overdue) && (w === 'all' || (w === 'today' ? !!g.overdue || sameDay(g.ends_at, new Date(now)) : Date.parse(g.ends_at) <= now + TWO_HOURS));

/** Hurtigt overblik over, hvem der skal tjekkes ind eller ud, sorteret efter hvem der skal først. */
export function ArrivalsPage() {
  const { openBill } = useStaff();
  const act = useAct();
  const { data, error, reload } = useStaffData<GuestRow[]>('staff_guests', {}, 8000);
  const [mode, setMode] = useState<'arrivals' | 'departures'>('arrivals');
  const [win, setWin] = useState<Window>('soon');
  const [q, setQ] = useState('');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const all = data ?? [];
  const search = (g: GuestRow) => `${g.guest_name} ${g.room_number} ${g.reference}`.toLowerCase().includes(q.trim().toLowerCase());
  const arrivals = all.filter(g => arrivalDue(g, win, now)).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const departures = all.filter(g => departureDue(g, win, now)).sort((a, b) => Date.parse(a.ends_at) - Date.parse(b.ends_at));
  const rows = (mode === 'arrivals' ? arrivals : departures).filter(search);
  async function checkIn(g: GuestRow) {
    const r = await act('staff_check_in', { _booking: g.id }, `Værelse ${g.room_number}: ${g.guest_name} er tjekket ind`);
    if (r.ok) await reload();
  }
  return (
    <>
      <PageTitle title="Ankomster & afrejser" hint="Hvem skal tjekkes ind eller ud? Den der skal først, står øverst." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border p-0.5" role="tablist" aria-label="Ankomster eller afrejser">
          {([['arrivals', `Ankomster (${arrivals.length})`], ['departures', `Afrejser (${departures.length})`]] as const).map(([m, l]) => <Button key={m} size="sm" role="tab" aria-selected={mode === m} variant={mode === m ? 'default' : 'ghost'} onClick={() => setMode(m)}>{l}</Button>)}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">Vis
          <select aria-label="Tidsrum" className={field} value={win} onChange={e => setWin(e.target.value as Window)}>{WINDOWS.map(([w, l]) => <option key={w} value={w}>{l}</option>)}</select>
        </label>
        <label className="relative ml-auto block w-full min-w-48 sm:w-72"><span className="sr-only">Søg gæst</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Søg navn, værelse eller booking" className={`${field} pl-9`} /></label>
      </div>
      <ul className="space-y-2">
        {rows.map(g => {
          const at = mode === 'arrivals' ? g.starts_at : g.ends_at;
          const diff = Date.parse(at) - now;
          const late = diff < 0;
          return (
            <li key={g.id} className={`${card} flex flex-wrap items-center gap-x-4 gap-y-2 py-3 ${late ? 'border-destructive/50' : ''}`}>
              <div className="w-24 shrink-0"><p className="font-display text-2xl leading-none tabular-nums">{hm(at)}</p><p className={`mt-1 text-xs ${late ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>{relativeTime(diff)}</p></div>
              <div className="font-display text-3xl leading-none">{g.room_number}</div>
              <div className="min-w-0 flex-1"><p className="font-semibold">{g.guest_name}</p><p className="text-xs text-muted-foreground">{g.reference} · {g.guests} {g.guests === 1 ? 'gæst' : 'gæster'}{mode === 'departures' ? ` · saldo ${fmtDKK(g.balance_cents)}` : ''}</p></div>
              <div className="flex gap-2">
                {mode === 'arrivals'
                  ? <><Button size="sm" onClick={() => checkIn(g)}>Tjek ind</Button><Button size="sm" variant="outline" onClick={() => openBill(g.id)}>Åbn</Button></>
                  : <Button size="sm" onClick={() => openBill(g.id)}>Tjek ud · {fmtDKK(g.balance_cents)}</Button>}
              </div>
            </li>
          );
        })}
        {rows.length === 0 && <li className={`${card} py-10 text-center text-sm text-muted-foreground`}>{error ?? (data ? (mode === 'arrivals' ? 'Ingen ankomster i det valgte tidsrum' : 'Ingen afrejser i det valgte tidsrum') : 'Henter…')}</li>}
      </ul>
    </>
  );
}

/** Gæster & ophold: overblik, ankomster/afrejser og reservationer samlet ét sted. Gæsten åbnes med regning, tider og check ind/ud. */
export function GuestsSection({ page }: { page: string }) {
  if (page === 'arrivals') return <ArrivalsPage />;
  if (page === 'reservations') return <ReservationsPage />;
  return <GuestsPage />;
}
