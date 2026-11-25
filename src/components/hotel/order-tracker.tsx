import { useEffect, useRef, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDKK } from '@/lib/money';

export type TrackedOrder = { id: string; type: string; details: string; status: string; created_at: string; updated_at?: string; total_cents?: number; reject_reason?: string };

const FOOD_STEPS: { s: string; label: string; text: string }[] = [
  { s: 'pending', label: 'Modtaget', text: 'Vi har modtaget din bestilling.' },
  { s: 'accepted', label: 'Accepteret', text: 'Køkkenet har accepteret din bestilling.' },
  { s: 'in_progress', label: 'Tilberedes', text: 'Din bestilling bliver lavet lige nu.' },
  { s: 'ready', label: 'Klar', text: 'Din bestilling er klar og bringes til dit værelse.' },
  { s: 'done', label: 'Leveret', text: 'Din bestilling er leveret. God fornøjelse!' },
];
const TOWEL_STEPS: { s: string; label: string; text: string }[] = [
  { s: 'pending', label: 'Modtaget', text: 'Vi har modtaget din bestilling af håndklæder.' },
  { s: 'in_progress', label: 'På vej', text: 'Personalet er på vej med dine håndklæder.' },
  { s: 'done', label: 'Leveret', text: 'Dine håndklæder er leveret.' },
];
const stepsFor = (type: string) => (type === 'towels' ? TOWEL_STEPS : FOOD_STEPS);
/** Håndklæde-ordrer springer "accepteret" og "klar" over. */
const indexOf = (type: string, status: string) => {
  const steps = stepsFor(type);
  const i = steps.findIndex(x => x.s === status);
  if (i >= 0) return i;
  return type === 'towels' && status === 'accepted' ? 0 : type === 'towels' && status === 'ready' ? 1 : 0;
};
export const statusText = (o: Pick<TrackedOrder, 'type' | 'status' | 'reject_reason'>) =>
  o.status === 'rejected' ? `Din bestilling kunne ikke gennemføres${o.reject_reason ? `: ${o.reject_reason}` : '.'}`
    : o.status === 'cancelled' ? 'Du har annulleret bestillingen.'
      : stepsFor(o.type)[indexOf(o.type, o.status)]!.text;
const hm = (iso: string) => new Date(iso).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });

/** En bestilling med live-sporing: hvilket trin den er nået til, og hvornår den sidst blev opdateret. */
export function OrderTrackCard({ o, children }: { o: TrackedOrder; children?: ReactNode }) {
  const steps = stepsFor(o.type);
  const idx = indexOf(o.type, o.status);
  const closed = o.status === 'rejected' || o.status === 'cancelled';
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="break-words text-sm font-semibold">{o.details || 'Håndklæder'}</p><p className="text-xs text-muted-foreground">Bestilt {hm(o.created_at)}{o.total_cents ? ` · ${fmtDKK(o.total_cents)}` : ''}</p></div>
      </div>
      {closed ? (
        <p className={`mt-2 flex items-start gap-2 rounded-lg p-3 text-sm ${o.status === 'rejected' ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-muted-foreground'}`} role="status"><X className="mt-0.5 h-4 w-4 shrink-0" />{statusText(o)}</p>
      ) : (
        <>
          <ol className="mt-3 flex items-start" aria-label="Status på bestillingen">
            {steps.map((st, i) => {
              const done = i < idx || o.status === 'done', current = i === idx && o.status !== 'done';
              return (
                <li key={st.s} className="flex min-w-0 flex-1 flex-col items-center text-center" aria-current={current ? 'step' : undefined}>
                  <div className="flex w-full items-center">
                    <span className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : done || current ? 'bg-primary' : 'bg-border'}`} />
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] ${done ? 'border-primary bg-primary text-primary-foreground' : current ? 'animate-pulse border-primary bg-primary/15 text-primary' : 'border-border text-transparent'}`}>{done ? <Check className="h-3.5 w-3.5" /> : '•'}</span>
                    <span className={`h-0.5 flex-1 ${i === steps.length - 1 ? 'opacity-0' : done ? 'bg-primary' : 'bg-border'}`} />
                  </div>
                  <span className={`mt-1 text-[11px] leading-tight ${current ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{st.label}</span>
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-sm" role="status">{statusText(o)}{o.updated_at && o.status !== 'done' ? <span className="text-xs text-muted-foreground"> · opdateret {hm(o.updated_at)}</span> : null}</p>
        </>
      )}
      {children}
    </li>
  );
}

/** Giver gæsten besked (toast og vibration), hver gang en af bestillingerne skifter status. Første indlæsning er stille. */
export function useOrderNotifications(orders: TrackedOrder[], enabled = true) {
  const prev = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const next = new Map(orders.map(o => [o.id, o.status]));
    if (prev.current) {
      for (const o of orders) {
        const before = prev.current.get(o.id);
        if (before === undefined || before === o.status || o.status === 'cancelled') continue; // nye ordrer er gæstens egen handling
        const title = o.type === 'towels' ? 'Håndklæder' : 'Din bestilling';
        if (o.status === 'rejected') toast.error(`${title} blev afvist`, { description: o.reject_reason || undefined, duration: 10000 });
        else toast(title, { description: statusText(o), duration: 6000 });
        try { navigator.vibrate?.(80); } catch { /* ikke understøttet */ }
      }
    }
    prev.current = next;
  }, [orders, enabled]);
}
