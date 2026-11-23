import { AlertTriangle, Clock, ShowerHead } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isDelayed } from '@/lib/ops';
import { hm, useAct, useStaffData } from '@/components/staff/core';

type TowelOrder = { id: string; room_number: string; type: string; details: string; status: string; quantity: number; created_at: string; updated_at: string; guest_name: string | null };
const OPEN = ['pending', 'accepted', 'in_progress', 'ready'];
const LABEL: Record<string, string> = { pending: 'Ny', accepted: 'Ny', in_progress: 'I gang', ready: 'I gang', done: 'Færdig', cancelled: 'Annulleret', rejected: 'Afvist' };

/** Håndklæde-bytte: gæstens bestilling af nye håndklæder til værelset. Behandles som en opgave sammen med rengøring. */
export function TowelTasks() {
  const act = useAct();
  const { data, reload } = useStaffData<TowelOrder[]>('staff_orders', { _limit: 150 }, 6000);
  const all = (data ?? []).filter(o => o.type === 'towels');
  const open = all.filter(o => OPEN.includes(o.status)).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const closed = all.filter(o => !OPEN.includes(o.status)).slice(0, 8);
  const now = Date.now();
  async function set(o: TowelOrder, status: 'in_progress' | 'done') {
    const r = await act('staff_set_order_status', { _order: o.id, _status: status }, status === 'done' ? `Værelse ${o.room_number}: poolhåndklæder leveret` : undefined);
    if (r.ok) await reload();
  }
  return (
    <section className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-3xl"><ShowerHead className="h-6 w-6 text-brass" />Poolhåndklæder</h2>
        <span className="text-sm text-muted-foreground">{open.length} åbne</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Poolhåndklæder, som gæsten bestiller separat (uden rengøring). De byttes og leveres til værelset. Gæsten kan bestille 1 gang hver 12. time.</p>
      <ul className="mt-4 space-y-3">
        {open.map(o => {
          const late = isDelayed(o.status === 'pending' ? 'pending' : 'in_progress', o.updated_at ?? o.created_at, now);
          return (
            <li key={o.id} className={`rounded-lg border p-4 ${late ? 'border-destructive' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><p className="font-display text-3xl leading-none">{o.room_number}</p><p className="mt-1 text-sm text-muted-foreground">{o.guest_name ?? 'Gæst'} · bestilt {hm(o.created_at)}</p></div>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">{LABEL[o.status]}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-1 font-semibold text-primary"><ShowerHead className="h-3 w-3" />Byt {o.quantity} {o.quantity === 1 ? 'poolhåndklæde' : 'poolhåndklæder'}</span>
                {late && <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 font-semibold text-destructive"><AlertTriangle className="h-3 w-3" />Forsinket</span>}
                <span className="flex items-center gap-1 rounded-full border px-2 py-1"><Clock className="h-3 w-3" />Leveres til værelset</span>
              </div>
              <div className="mt-3 flex gap-2">
                {(o.status === 'pending' || o.status === 'accepted') && <Button size="sm" onClick={() => set(o, 'in_progress')}>Start</Button>}
                <Button size="sm" variant={o.status === 'in_progress' || o.status === 'ready' ? 'default' : 'outline'} onClick={() => set(o, 'done')}>Færdig</Button>
              </div>
            </li>
          );
        })}
        {open.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Ingen bestillinger af poolhåndklæder lige nu</li>}
      </ul>
      {closed.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Seneste afsluttede ({closed.length})</summary>
          <ul className="mt-2 divide-y">{closed.map(o => <li key={o.id} className="flex justify-between gap-3 py-2"><span>Værelse {o.room_number} · {o.quantity} {o.quantity === 1 ? 'poolhåndklæde' : 'poolhåndklæder'}</span><span className="text-muted-foreground">{LABEL[o.status] ?? o.status} · {hm(o.updated_at)}</span></li>)}</ul>
        </details>
      )}
    </section>
  );
}
