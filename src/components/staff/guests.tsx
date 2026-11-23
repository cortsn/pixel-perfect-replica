import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Info, LogIn, LogOut, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { rpc } from '@/lib/cleaning';
import { errorText } from '@/lib/hotel';
import { fmtDKK } from '@/lib/money';
import { PageTitle, card, dayTime, field, hm, useStaff, useStaffData } from '@/components/staff/core';
import { ReservationsPage } from '@/components/staff/reservations';

export type GuestRow = {
  id: string; reference: string; room_number: string; guest_name: string; guest_email: string | null; guests: number; starts_at: string; ends_at: string;
  checked_in_at: string | null; balance_cents: number; due_cents?: number; total_cents?: number; open_orders?: number; in_house: boolean; overdue?: boolean;
};
type Filter = 'all' | 'arriving' | 'in' | 'departing';

const sameDay = (iso: string, now = new Date()) => new Date(iso).toDateString() === now.toDateString();
/** Ankommer: opholdet er ikke startet. Boende: opholdet er i gang. Tjekker ud: slutter i dag, eller check ud-tiden er overskredet. */
export const isArriving = (g: GuestRow) => !g.in_house && !g.overdue;
export const isDeparting = (g: GuestRow) => !!g.overdue || (g.in_house && sameDay(g.ends_at));

/** Gæster: information om gæsten og værelset (personer, adgang i appen og aktivitet). Ingen regning og ingen tjek ind/ud her. */
export function GuestsPage() {
  const { openGuest } = useStaff();
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
          <thead className="border-b text-muted-foreground"><tr>{['Værelse', 'Gæst', 'Personer', 'Ophold', 'Status', ''].map(h => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody className="divide-y">
            {rows.map(g => (
              <tr key={g.id}>
                <td className="px-4 py-3 font-display text-2xl">{g.room_number}</td>
                <td className="px-4 py-3"><span className="font-semibold">{g.guest_name}</span><span className="block text-xs text-muted-foreground">{g.reference}</span></td>
                <td className="px-4 py-3 tabular-nums">{g.guests}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{dayTime(g.starts_at)}<br />{dayTime(g.ends_at)}</td>
                <td className="px-4 py-3">
                  {g.overdue
                    ? <span className="rounded-full bg-status-dirty/15 px-2 py-0.5 text-xs font-semibold text-status-dirty">Check ud overskredet</span>
                    : <span className={`rounded-full px-2 py-0.5 text-xs ${g.in_house ? 'bg-status-clean/15 text-status-clean' : 'bg-secondary'}`}>{g.in_house ? (isDeparting(g) ? 'Tjekker ud i dag' : g.checked_in_at ? 'Tjekket ind' : 'Ikke tjekket ind') : 'Ankommer'}</span>}
                </td>
                <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => openGuest(g.id)}><Info />Gæsteinfo</Button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">{error ?? (data ? 'Ingen gæster matcher' : 'Henter…')}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground"><button type="button" className="underline" onClick={() => void reload()}>Opdater</button> · Tjek ind og ud sker under Ankomster & afrejser.</p>
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
/** Kan gæsten tjekkes ud med ét tryk (og en bekræftelse)? Intet at betale og ingen åbne roomserviceordrer. */
export const quickCheckout = (g: GuestRow) => (g.balance_cents ?? 0) <= 0 && (g.open_orders ?? 0) === 0;

const PREFS = 'hp-arrivals';
const readPrefs = (): { mode: 'arrivals' | 'departures'; win: Window } => {
  try { const p = JSON.parse(localStorage.getItem(PREFS) ?? '{}') as { mode?: string; win?: string }; return { mode: p.mode === 'departures' ? 'departures' : 'arrivals', win: p.win === 'today' || p.win === 'all' ? p.win : 'soon' }; } catch { return { mode: 'arrivals', win: 'soon' }; }
};

/**
 * Ankomster & afrejser: her sker tjek ind og tjek ud. Bygget til travle perioder:
 * den der skal først står øverst, knapperne er store, listen opdateres med det samme (uden at vente på serveren),
 * søgefeltet har fokus (skriv værelsesnummer, og tryk Enter, hvis der kun er ét resultat), og valgene huskes.
 * Tjek ud uden saldo og uden åbne ordrer tager to tryk (med bekræftelse); ellers åbnes en kompakt betalingsvisning.
 */
export function ArrivalsPage() {
  const { openGuest, openCheckout, reloadDash } = useStaff();
  const { pin } = useStaff();
  const { data, error, reload } = useStaffData<GuestRow[]>('staff_guests', {}, 5000);
  const prefs = useMemo(readPrefs, []);
  const [mode, setMode] = useState(prefs.mode);
  const [win, setWin] = useState<Window>(prefs.win);
  const [q, setQ] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [gone, setGone] = useState<Set<string>>(new Set()); // rækker, der allerede er behandlet, men serveren ikke har svaret endnu
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 20000); return () => clearInterval(t); }, []);
  useEffect(() => { search.current?.focus(); }, []);
  useEffect(() => { try { localStorage.setItem(PREFS, JSON.stringify({ mode, win })); } catch { /* ingen lagring */ } }, [mode, win]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const all = (data ?? []).filter(g => !gone.has(g.id));
  const match = (g: GuestRow) => `${g.guest_name} ${g.room_number} ${g.reference}`.toLowerCase().includes(q.trim().toLowerCase());
  const arrivals = useMemo(() => all.filter(g => arrivalDue(g, win, now)).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)), [all, win, now]);
  const departures = useMemo(() => all.filter(g => departureDue(g, win, now)).sort((a, b) => Date.parse(a.ends_at) - Date.parse(b.ends_at)), [all, win, now]);
  const rows = (mode === 'arrivals' ? arrivals : departures).filter(match);

  const hide = (id: string, on: boolean) => setGone(s => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const checkIn = useCallback(async (g: GuestRow) => {
    hide(g.id, true);
    const { error: e } = await rpc('staff_check_in', { _pin: pin, _booking: g.id });
    if (e) { hide(g.id, false); toast.error(errorText(e)); return; }
    toast.success(`Værelse ${g.room_number}: ${g.guest_name} er tjekket ind`);
    reloadDash();
    void reload().then(() => hide(g.id, false));
  }, [pin, reload, reloadDash]);
  const quickOut = useCallback(async (g: GuestRow) => {
    hide(g.id, true); setConfirmId(null);
    const { error: e } = await rpc('staff_checkout', { _pin: pin, _booking: g.id, _method: '', _note: '' });
    if (e) { hide(g.id, false); toast.error(errorText(e)); return; }
    toast.success(`Værelse ${g.room_number} er tjekket ud og sat til rengøring`);
    reloadDash();
    void reload().then(() => hide(g.id, false));
  }, [pin, reload, reloadDash]);
  const checkOut = (g: GuestRow) => {
    if (!quickCheckout(g)) { openCheckout(g.id); return; }
    if (confirmId === g.id) { void quickOut(g); return; }
    setConfirmId(g.id);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setConfirmId(null), 4000);
  };
  const primary = (g: GuestRow) => (mode === 'arrivals' ? void checkIn(g) : checkOut(g));

  return (
    <>
      <PageTitle title="Ankomster & afrejser" hint="Her tjekkes gæster ind og ud. Den der skal først, står øverst." />
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 mb-3 flex flex-wrap items-center gap-2 bg-background/95 px-4 py-2 backdrop-blur lg:-mx-8 lg:px-8">
        <div className="flex rounded-lg border p-0.5" role="tablist" aria-label="Ankomster eller afrejser">
          {([['arrivals', `Ankomster (${arrivals.length})`], ['departures', `Afrejser (${departures.length})`]] as const).map(([m, l]) => <Button key={m} size="sm" role="tab" aria-selected={mode === m} variant={mode === m ? 'default' : 'ghost'} onClick={() => setMode(m)}>{l}</Button>)}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">Vis
          <select aria-label="Tidsrum" className={field} value={win} onChange={e => setWin(e.target.value as Window)}>{WINDOWS.map(([w, l]) => <option key={w} value={w}>{l}</option>)}</select>
        </label>
        <label className="relative ml-auto block w-full min-w-48 sm:w-72"><span className="sr-only">Søg gæst</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input ref={search} value={q} onChange={e => setQ(e.target.value)} placeholder="Søg navn, værelse eller booking" aria-keyshortcuts="Enter Escape"
            onKeyDown={e => { if (e.key === 'Escape') setQ(''); if (e.key === 'Enter' && rows.length === 1) primary(rows[0]!); }}
            className={`${field} pl-9`} /></label>
      </div>
      {q && rows.length === 1 && <p className="mb-2 text-xs text-muted-foreground">Tryk Enter for at tjekke {rows[0]!.guest_name} {mode === 'arrivals' ? 'ind' : 'ud'}.</p>}
      <ul className="space-y-2" aria-live="polite">
        {rows.map(g => {
          const at = mode === 'arrivals' ? g.starts_at : g.ends_at;
          const diff = Date.parse(at) - now;
          const late = diff < 0;
          const quick = mode === 'departures' && quickCheckout(g);
          const confirming = confirmId === g.id;
          const due = g.balance_cents ?? 0;
          return (
            <li key={g.id} className={`${card} flex flex-wrap items-center gap-x-4 gap-y-2 py-3 ${late ? 'border-destructive/50' : ''}`}>
              <div className="w-24 shrink-0"><p className="font-display text-2xl leading-none tabular-nums">{hm(at)}</p><p className={`mt-1 text-xs ${late ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>{relativeTime(diff)}</p></div>
              <div className="font-display text-3xl leading-none">{g.room_number}</div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{g.guest_name}</p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  <span>{g.reference} · {g.guests} {g.guests === 1 ? 'gæst' : 'gæster'}</span>
                  {mode === 'departures' && (due > 0 ? <span className="rounded-full bg-status-dirty/15 px-2 py-0.5 font-semibold text-status-dirty">Skylder {fmtDKK(due)}</span> : <span className="rounded-full bg-status-clean/15 px-2 py-0.5 font-semibold text-status-clean">Intet at betale</span>)}
                  {mode === 'departures' && (g.open_orders ?? 0) > 0 && <span className="flex items-center gap-1 rounded-full bg-status-cleaning/25 px-2 py-0.5 font-semibold text-foreground"><AlertTriangle className="h-3 w-3" />{g.open_orders} åben{(g.open_orders ?? 0) === 1 ? '' : 'e'} ordre{(g.open_orders ?? 0) === 1 ? '' : 'r'}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="lg" className={`h-11 min-w-32 text-base ${confirming ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}`} onClick={() => primary(g)} aria-label={mode === 'arrivals' ? `Tjek ${g.guest_name} ind` : `Tjek ${g.guest_name} ud`}>
                  {mode === 'arrivals' ? <><LogIn />Tjek ind</> : confirming ? <><Check />Bekræft tjek ud</> : <><LogOut />{due > 0 ? `Tjek ud · ${fmtDKK(due)}` : 'Tjek ud'}</>}
                </Button>
                <Button size="icon" variant="outline" className="h-11 w-11" aria-label={`Gæsteinfo for ${g.guest_name}`} onClick={() => openGuest(g.id)}><Info /></Button>
              </div>
            </li>
          );
        })}
        {rows.length === 0 && <li className={`${card} py-10 text-center text-sm text-muted-foreground`}>{error ?? (data ? (q ? 'Ingen gæster matcher søgningen' : mode === 'arrivals' ? 'Ingen ankomster i det valgte tidsrum' : 'Ingen afrejser i det valgte tidsrum') : 'Henter…')}</li>}
      </ul>
    </>
  );
}

/** Gæster & ophold: gæsteinfo, ankomster/afrejser (tjek ind og ud) og reservationer samlet ét sted. */
export function GuestsSection({ page }: { page: string }) {
  if (page === 'arrivals') return <ArrivalsPage />;
  if (page === 'reservations') return <ReservationsPage />;
  return <GuestsPage />;
}
