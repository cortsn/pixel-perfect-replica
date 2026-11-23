import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Clock, Repeat, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { errorText } from '@/lib/hotel';
import { CLEANING_LABELS, fmtLeft, towelText, isOpen, rpc, sortCleaning, timeLeft, type CleaningRequest, type CleaningStatus } from '@/lib/cleaning';

const hm = (iso: string) => new Date(iso).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
type Data = { requests: CleaningRequest[] };

export function StaffRequests({ pin }: { pin: string }) {
  const [data, setData] = useState<Data>({ requests: [] });
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data: d, error } = await rpc<Data>('staff_cleaning', { _pin: pin });
    if (error) return;
    setData({ requests: d?.requests ?? [] });
  }, [pin]);
  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); setNow(Date.now()); }, 8000);
    const clock = setInterval(() => setNow(Date.now()), 30000);
    return () => { clearInterval(t); clearInterval(clock); };
  }, [load]);

  async function setCleaning(r: CleaningRequest, status: Exclude<CleaningStatus, 'requested'>) {
    setBusy(r.id);
    const { error } = await rpc('staff_set_cleaning', { _pin: pin, _request: r.id, _status: status });
    setBusy(null);
    if (error) { toast.error(errorText(error)); return; }
    toast.success(`Værelse ${r.room_number}: ${CLEANING_LABELS[status]}`);
    await load();
  }
  return <StaffRequestsView requests={data.requests} now={now} busy={busy} onCleaning={setCleaning} />;
}

/** Ren visning, så demo-siden kan bruge samme layout uden database. */
export function StaffRequestsView({ requests, now, busy, onCleaning: setCleaning }: {
  requests: CleaningRequest[]; now: number; busy: string | null;
  onCleaning: (r: CleaningRequest, status: Exclude<CleaningStatus, 'requested'>) => void;
}) {
  const open = sortCleaning(requests.filter(r => isOpen(r.status)), now);
  const closed = requests.filter(r => !isOpen(r.status));

  return (
    <div>
      <section className="min-w-0">
        <p className="text-sm text-muted-foreground">{open.length} {open.length === 1 ? 'åben' : 'åbne'} · kortest tid først</p>
        <ul className="mt-4 space-y-3">
          {open.map(r => {
            const left = timeLeft(r, now);
            const ending = left !== null && left > 0 && left < 45 * 60000;
            return (
              <li key={r.id} className={`rounded-lg border p-4 ${r.is_repeat ? 'border-destructive' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-3xl leading-none">{r.room_number}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{r.guest_name}</p>
                  </div>
                  <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">{CLEANING_LABELS[r.status]}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {r.kind === 'checkout' && <span className="flex items-center gap-1 rounded-full bg-brass/20 px-2 py-1 font-semibold">Afrejse · fuld rengøring</span>}
                  {r.is_repeat && <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 font-semibold text-destructive"><Repeat className="h-3 w-3" />Bestilt igen – ikke nået første gang</span>}
                  <span className={`flex items-center gap-1 rounded-full border px-2 py-1 ${(r.towel_count ?? (r.wants_towels ? 1 : 0)) > 0 ? "border-primary/40 bg-primary/10 font-semibold text-primary" : ""}`}><Sparkles className="h-3 w-3" />{towelText(r)}</span>
                  {r.away_from && r.away_until
                    ? <span className={`flex items-center gap-1 rounded-full border px-2 py-1 ${ending ? 'border-destructive font-semibold text-destructive' : ''}`}><Clock className="h-3 w-3" />Væk {hm(r.away_from)}–{hm(r.away_until)} · {left !== null && left > 0 ? `${fmtLeft(left)} tilbage` : 'tidsrum udløbet'}</span>
                    : <span className="flex items-center gap-1 rounded-full border px-2 py-1"><Clock className="h-3 w-3" />Når som helst</span>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.status === 'requested' && <Button size="sm" disabled={busy === r.id} onClick={() => setCleaning(r, 'in_progress')}>Start</Button>}
                  <Button size="sm" variant={r.status === 'in_progress' ? 'default' : 'outline'} disabled={busy === r.id} onClick={() => setCleaning(r, 'done')}>Færdig</Button>
                  {r.kind !== 'checkout' && <Button size="sm" variant="outline" disabled={busy === r.id} className="text-destructive" onClick={() => setCleaning(r, 'not_reached')}><AlertTriangle />Ikke nået</Button>}
                </div>
              </li>
            );
          })}
          {open.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Ingen rengøringsbestillinger lige nu</li>}
        </ul>
        {closed.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted-foreground">Afsluttede de seneste 12 timer ({closed.length})</summary>
            <ul className="mt-2 divide-y">
              {closed.map(r => <li key={r.id} className="flex justify-between gap-3 py-2"><span>Værelse {r.room_number} · {r.guest_name}</span><span className={r.status === 'not_reached' ? 'font-semibold text-destructive' : 'text-muted-foreground'}>{CLEANING_LABELS[r.status]}</span></li>)}
            </ul>
          </details>
        )}
      </section>

    </div>
  );
}
