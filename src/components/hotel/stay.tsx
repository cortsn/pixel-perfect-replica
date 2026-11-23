import { useState } from 'react';
import { Bell, CheckCircle2, Clock, DoorOpen, Pencil, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TimeWheelDialog } from '@/components/hotel/time-wheel';
import { countdown, dayTime, hm, noticeText, remaining } from '@/lib/stay';

type Kind = 'start' | 'end' | 'both';

/** Besked om, at hotellet har ændret opholdets tider. */
export function StayNotice({ kind, startsAt, endsAt, onDismiss }: { kind: Kind; startsAt: string; endsAt: string; onDismiss: () => void }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3 text-left text-sm">
      <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <p className="flex-1">{noticeText(kind, startsAt, endsAt)}</p>
      <button type="button" aria-label="Luk besked" onClick={onDismiss} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
    </div>
  );
}

/** Nedtælling til opholdets start. */
export function WaitingScreen({ name, startsAt, clock, notice, onLogout }: { name: string; startsAt: string; clock: number; notice?: React.ReactNode; onLogout: () => void }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      {notice && <div className="w-full">{notice}</div>}
      <Clock className="h-10 w-10 text-brass" />
      <p className="font-display text-2xl">HotelPilot</p>
      <h1 className="text-4xl">Velkommen, {name}</h1>
      <p className="text-sm text-muted-foreground">Tid til dit ophold starter</p>
      <p className="font-display text-5xl tabular-nums" role="timer">{countdown(startsAt, clock)}</p>
      <p className="text-sm text-muted-foreground">Du kan tjekke ind her i appen {dayTime(startsAt)}. Du skal ikke forbi receptionen.</p>
      <p className="text-xs text-muted-foreground">Hvis hotellet gør værelset klar tidligere eller senere, får du besked her.</p>
      <Button variant="outline" onClick={onLogout}>Log ud</Button>
    </div>
  );
}

/** Opholdet er startet, men gæsten har ikke tjekket ind endnu. */
export function CheckInScreen({ name, room, busy, notice, onCheckIn, onLogout }: { name: string; room: string; busy?: boolean; notice?: React.ReactNode; onCheckIn: () => void; onLogout: () => void }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      {notice && <div className="w-full">{notice}</div>}
      <DoorOpen className="h-10 w-10 text-brass" />
      <p className="font-display text-2xl">HotelPilot</p>
      <h1 className="text-4xl">Dit værelse er klar, {name}</h1>
      <p className="text-muted-foreground">Værelse {room} venter på dig. Tjek ind med et tryk, så åbner din digitale nøgle.</p>
      <Button className="h-14 w-full rounded-full bg-gradient-brass text-base font-semibold text-accent-foreground shadow-soft" disabled={busy} onClick={onCheckIn}><CheckCircle2 className="!h-5 !w-5" />Tjek ind</Button>
      <Button variant="ghost" onClick={onLogout}>Log ud</Button>
    </div>
  );
}

/** Diskret timer nederst på siden – kun synlig, hvis man scroller helt ned. */
export function StayEndTimer({ endsAt, clock }: { endsAt: string; clock: number }) {
  return (
    <p className="pb-4 pt-10 text-center text-xs text-muted-foreground" role="timer" aria-label="Tid til check ud">
      Check ud {dayTime(endsAt)} · om {remaining(endsAt, clock)}
    </p>
  );
}

export type StayRow = { id: string; reference: string; room_number: string; guest_name: string; guests?: number; starts_at: string; ends_at: string; checked_in_at: string | null };

/** Personalets oversigt: søg i opholdene, se tjek ind-status og ret start- eller sluttid med et ur. */
export function StayControlsView({ stays, now, busy, onChange }: { stays: StayRow[]; now: number; busy: string | null; onChange: (s: StayRow, starts: Date, ends: Date) => void }) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<{ stay: StayRow; which: 'start' | 'end' } | null>(null);
  const list = stays.filter(s => `${s.room_number} ${s.guest_name} ${s.reference}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <section id="ophold" className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-3xl">Ophold & tider</h2>
        <span className="text-sm text-muted-foreground">{q ? `${list.length} af ${stays.length}` : stays.length} ophold</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Ændr start- eller sluttid. Gæsten får besked i appen.</p>
      <label className="relative mt-3 block sm:max-w-sm"><span className="sr-only">Søg i ophold</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Søg værelse, navn eller booking" className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
      <ul className="mt-4 grid gap-3 lg:grid-cols-2">
        {list.map(s => {
          const started = Date.parse(s.starts_at) <= now;
          return (
            <li key={s.id} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-2xl font-semibold leading-none">{s.room_number}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{s.guest_name} · {s.reference}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${s.checked_in_at ? 'bg-status-clean/15 text-status-clean' : 'bg-secondary'}`}>
                  {s.checked_in_at ? `Tjekket ind ${hm(s.checked_in_at)}` : started ? 'Ikke tjekket ind' : 'Ikke startet'}
                </span>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><span className="text-muted-foreground">Start </span><span className="font-medium">{dayTime(s.starts_at)}</span></span>
                  {!started && <Button size="sm" variant="outline" disabled={busy === s.id} onClick={() => setEditing({ stay: s, which: 'start' })}><Pencil />Ændr start</Button>}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><span className="text-muted-foreground">Check ud </span><span className="font-medium">{dayTime(s.ends_at)}</span></span>
                  <Button size="sm" variant="outline" disabled={busy === s.id} onClick={() => setEditing({ stay: s, which: 'end' })}><Pencil />Ændr check ud</Button>
                </div>
              </div>
            </li>
          );
        })}
        {list.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">{stays.length === 0 ? 'Ingen aktive ophold' : 'Ingen ophold matcher søgningen'}</li>}
      </ul>
      {editing && (
        <TimeWheelDialog
          title={editing.which === 'start' ? `Ny starttid · Værelse ${editing.stay.room_number}` : `Ny check ud-tid · Værelse ${editing.stay.room_number}`}
          description={`${editing.stay.guest_name} · ${editing.stay.reference}. Gæsten får besked i appen.`}
          value={new Date(editing.which === 'start' ? editing.stay.starts_at : editing.stay.ends_at)}
          validate={d => editing.which === 'start'
            ? (d.getTime() >= Date.parse(editing.stay.ends_at) ? 'Starten skal være før check ud-tiden.' : null)
            : (d.getTime() <= Date.parse(editing.stay.starts_at) ? 'Check ud skal være efter starttiden.' : d.getTime() <= now ? 'Check ud-tiden skal ligge i fremtiden.' : null)}
          onClose={() => setEditing(null)}
          onSave={d => { const { stay, which } = editing; setEditing(null); onChange(stay, which === 'start' ? d : new Date(stay.starts_at), which === 'end' ? d : new Date(stay.ends_at)); }}
        />
      )}
    </section>
  );
}
