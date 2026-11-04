import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BedDouble, Clock, Repeat, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { errorText, HOUSEKEEPING_LABELS, type HousekeepingStatus } from '@/lib/hotel';
import { CLEANING_LABELS, fmtLeft, isOpen, rpc, sortCleaning, timeLeft, type CleaningRequest, type CleaningStatus, type EarlyCheckin } from '@/lib/cleaning';

const hm = (iso: string) => new Date(iso).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
type Data = { requests: CleaningRequest[]; early: EarlyCheckin[] };

export function StaffRequests({ pin }: { pin: string }) {
  const [data, setData] = useState<Data>({ requests: [], early: [] });
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data: d, error } = await rpc<Data>('staff_cleaning', { _pin: pin });
    if (error) return;
    setData({ requests: d?.requests ?? [], early: d?.early ?? [] });
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
  async function setEarly(e: EarlyCheckin, status: 'approved' | 'declined') {
    setBusy(e.id);
    const { error } = await rpc('staff_set_early_checkin', { _pin: pin, _booking: e.id, _status: status });
    setBusy(null);
    if (error) { toast.error(errorText(error)); return; }
    toast.success(`Værelse ${e.room_number}: ${status === 'approved' ? 'tidlig check-in godkendt' : 'afvist'}`);
    await load();
  }

  const open = sortCleaning(data.requests.filter(r => isOpen(r.status)), now);
  const closed = data.requests.filter(r => !isOpen(r.status));
  const earlyOpen = data.early.filter(e => e.early_checkin_status === 'requested');
  const earlyDone = data.early.filter(e => e.early_checkin_status !== 'requested');

  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <section className="min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-3xl">Rengøring</h2>
          <span className="text-sm text-muted-foreground">{open.length} åbne · kortest tid først</span>
        </div>
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
                  {r.is_repeat && <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 font-semibold text-destructive"><Repeat className="h-3 w-3" />Bestilt igen – ikke nået første gang</span>}
                  <span className="flex items-center gap-1 rounded-full border px-2 py-1"><Sparkles className="h-3 w-3" />{r.wants_towels ? 'Byt håndklæder' : 'Ingen håndklædebytte'}</span>
                  {r.away_from && r.away_until
                    ? <span className={`flex items-center gap-1 rounded-full border px-2 py-1 ${ending ? 'border-destructive font-semibold text-destructive' : ''}`}><Clock className="h-3 w-3" />Væk {hm(r.away_from)}–{hm(r.away_until)} · {left !== null && left > 0 ? `${fmtLeft(left)} tilbage` : 'tidsrum udløbet'}</span>
                    : <span className="flex items-center gap-1 rounded-full border px-2 py-1"><Clock className="h-3 w-3" />Når som helst</span>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.status === 'requested' && <Button size="sm" disabled={busy === r.id} onClick={() => setCleaning(r, 'in_progress')}>Start</Button>}
                  <Button size="sm" variant={r.status === 'in_progress' ? 'default' : 'outline'} disabled={busy === r.id} onClick={() => setCleaning(r, 'done')}>Færdig</Button>
                  <Button size="sm" variant="outline" disabled={busy === r.id} className="text-destructive" onClick={() => setCleaning(r, 'not_reached')}><AlertTriangle />Ikke nået</Button>
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

      <section className="min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-3xl">Tidlig check-in</h2>
          <span className="text-sm text-muted-foreground">{earlyOpen.length} afventer</span>
        </div>
        <ul className="mt-4 space-y-3">
          {earlyOpen.map(e => {
            const ready = e.housekeeping_status === 'clean';
            return (
              <li key={e.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-3xl leading-none">{e.room_number}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{e.guest_name} · {e.reference}</p>
                  </div>
                  <span className="text-right text-sm"><span className="block font-semibold">Vil komme kl. {e.early_checkin_time ? hm(e.early_checkin_time) : '–'}</span><span className="text-xs text-muted-foreground">Normal check-in kl. {hm(e.starts_at)}</span></span>
                </div>
                <p className={`mt-3 flex items-center gap-2 text-xs ${ready ? 'text-status-clean' : 'text-status-dirty'}`}><BedDouble className="h-4 w-4" />Værelset: {HOUSEKEEPING_LABELS[e.housekeeping_status as HousekeepingStatus] ?? e.housekeeping_status}{ready ? ' – klar' : ' – ikke klar endnu'}</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" disabled={busy === e.id} onClick={() => setEarly(e, 'approved')}>Godkend</Button>
                  <Button size="sm" variant="outline" disabled={busy === e.id} onClick={() => setEarly(e, 'declined')}>Afvis</Button>
                </div>
              </li>
            );
          })}
          {earlyOpen.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Ingen anmodninger om tidlig check-in</li>}
        </ul>
        {earlyDone.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted-foreground">Besvarede ({earlyDone.length})</summary>
            <ul className="mt-2 divide-y">
              {earlyDone.map(e => <li key={e.id} className="flex justify-between gap-3 py-2"><span>Værelse {e.room_number} · {e.guest_name} · kl. {e.early_checkin_time ? hm(e.early_checkin_time) : '–'}</span><span className="text-muted-foreground">{e.early_checkin_status === 'approved' ? 'Godkendt' : 'Afvist'}</span></li>)}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
