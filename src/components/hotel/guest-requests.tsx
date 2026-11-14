import { useState } from 'react';
import { CalendarClock, Check, Info, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { todayAt, type CleaningRequest } from '@/lib/cleaning';

const hm = (iso: string) => new Date(iso).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });

export const CLEANING_NOTE = 'Rengøringen prøver at blive nået, men det er ikke sikkert.';

function Choice({ on, onClick, title, hint }: { on: boolean; onClick: () => void; title: string; hint?: string }) {
  return (
    <Button type="button" variant={on ? 'default' : 'outline'} aria-pressed={on} onClick={onClick} className="h-auto flex-col gap-1 whitespace-normal px-3 py-4 text-center">
      <span className="flex items-center gap-1 font-semibold">{on && <Check className="h-4 w-4" />}{title}</span>
      {hint && <span className="text-xs font-normal opacity-80">{hint}</span>}
    </Button>
  );
}

/** Bestil rengøring: håndklædebytte ja/nej og evt. tidsrum, hvor gæsten ikke er på værelset. */
export function CleaningForm({ room, busy, onSubmit }: { room: string; busy?: boolean; onSubmit: (towels: boolean, from: Date | null, until: Date | null) => void }) {
  const [towels, setTowels] = useState(false);
  const [away, setAway] = useState(false);
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  function submit() {
    if (!away) { onSubmit(towels, null, null); return; }
    if (!from || !until) { toast.error('Vælg fra og til, eller vælg "Når som helst".'); return; }
    const f = todayAt(from), u = todayAt(until);
    if (u <= f) { toast.error('Sluttidspunktet skal være efter starttidspunktet.'); return; }
    if (u.getTime() <= Date.now()) { toast.error('Tidsrummet ligger allerede i fortiden.'); return; }
    onSubmit(towels, f, u);
  }
  return (
    <div className="space-y-5 text-center">
      <p className="text-muted-foreground">Rengøring af værelse {room}</p>
      <div>
        <p className="mb-2 flex items-center justify-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-brass" />Skal vi bytte håndklæder?</p>
        <div className="grid grid-cols-2 gap-2">
          <Choice on={towels} onClick={() => setTowels(true)} title="Ja, byt dem" />
          <Choice on={!towels} onClick={() => setTowels(false)} title="Nej tak" />
        </div>
      </div>
      <div>
        <p className="mb-2 flex items-center justify-center gap-2 font-semibold"><CalendarClock className="h-4 w-4 text-brass" />Hvornår passer det?</p>
        <div className="grid grid-cols-2 gap-2">
          <Choice on={!away} onClick={() => setAway(false)} title="Når som helst" />
          <Choice on={away} onClick={() => setAway(true)} title="Jeg er væk" hint="Vælg tidsrum" />
        </div>
        {away && (
          <div className="mt-3 grid grid-cols-2 gap-3 text-left">
            <label className="block text-sm">Væk fra<input type="time" value={from} onChange={e => setFrom(e.target.value)} className="mt-1 w-full rounded-md border bg-card p-3 text-lg" /></label>
            <label className="block text-sm">Tilbage kl.<input type="time" value={until} onChange={e => setUntil(e.target.value)} className="mt-1 w-full rounded-md border bg-card p-3 text-lg" /></label>
            <p className="col-span-2 text-xs text-muted-foreground">Personalet kommer først til de værelser, hvor der er kortest tid tilbage.</p>
          </div>
        )}
      </div>
      <p className="flex items-start justify-center gap-2 rounded-md bg-secondary p-3 text-left text-sm"><Info className="mt-0.5 h-4 w-4 shrink-0 text-brass" />{CLEANING_NOTE}</p>
      <Button className="h-14 w-full rounded-full bg-gradient-brass text-base font-semibold text-accent-foreground" disabled={busy} onClick={submit}>Bestil rengøring</Button>
    </div>
  );
}

/** Status på gæstens seneste rengøringsbestilling. */
export function CleaningStatusNote({ req }: { req: CleaningRequest | null }) {
  if (!req) return null;
  const window = req.away_from && req.away_until ? `Du er væk ${hm(req.away_from)}–${hm(req.away_until)}. ` : '';
  const towels = req.wants_towels ? 'Håndklæder byttes. ' : '';
  const text = {
    requested: `Bestilt. ${window}${towels}${CLEANING_NOTE}`,
    in_progress: 'Rengøringen er i gang.',
    done: 'Rengøringen er gennemført.',
    not_reached: 'Vi nåede desværre ikke rengøringen. Du kan bestille igen.',
  }[req.status];
  const warn = req.status === 'not_reached';
  return <p className={`mt-3 rounded-md border p-3 text-sm ${warn ? 'border-destructive text-destructive' : ''}`} role="status">{text}</p>;
}
