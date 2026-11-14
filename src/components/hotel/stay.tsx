import { Bell, CheckCircle2, Clock, DoorOpen, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
const STEP = (m: number) => m * 60000;

/** Personalets oversigt: tjek ind-status og knapper til at lægge tid på eller tage tid af. */
export function StayControlsView({ stays, now, busy, onChange }: { stays: StayRow[]; now: number; busy: string | null; onChange: (s: StayRow, starts: Date, ends: Date) => void }) {
  const shift = (iso: string, m: number) => new Date(Date.parse(iso) + STEP(m));
  const label = (m: number) => `${m > 0 ? '+' : '−'}${Math.abs(m) >= 60 ? `${Math.abs(m) / 60} t` : `${Math.abs(m)} min`}`;
  return (
    <section id="ophold" className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-3xl">Ophold & tider</h2>
        <span className="text-sm text-muted-foreground">{stays.length} ophold</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Ændr start- eller sluttid. Gæsten får besked i appen.</p>
      <ul className="mt-4 grid gap-3 lg:grid-cols-2">
        {stays.map(s => {
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
                  {!started && <div className="flex gap-1">{[-30, 30].map(m => <Button key={m} size="sm" variant="outline" disabled={busy === s.id} onClick={() => onChange(s, shift(s.starts_at, m), new Date(s.ends_at))}>{label(m)}</Button>)}</div>}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><span className="text-muted-foreground">Check ud </span><span className="font-medium">{dayTime(s.ends_at)}</span></span>
                  <div className="flex gap-1">{[-60, -30, 30, 60].map(m => <Button key={m} size="sm" variant="outline" disabled={busy === s.id} onClick={() => onChange(s, new Date(s.starts_at), shift(s.ends_at, m))}>{label(m)}</Button>)}</div>
                </div>
              </div>
            </li>
          );
        })}
        {stays.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Ingen aktive ophold</li>}
      </ul>
    </section>
  );
}
