import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ORDER_LABELS, type OrderStatus } from '@/lib/hotel';
import { isDelayed } from '@/lib/ops';

export type BoardOrder = { id: string; room_number: string; type: string; details: string; status: OrderStatus; created_at: string; updated_at?: string; quantity?: number };
const COLS: { s: OrderStatus; cls: string; dot: string }[] = [
  { s: 'pending', cls: 'border-t-status-dirty', dot: 'bg-status-dirty' },
  { s: 'in_progress', cls: 'border-t-status-cleaning', dot: 'bg-status-cleaning' },
  { s: 'ready', cls: 'border-t-status-occupied', dot: 'bg-status-occupied' },
  { s: 'done', cls: 'border-t-status-clean', dot: 'bg-status-clean' },
];
const NEXT: Partial<Record<OrderStatus, string>> = { pending: 'Start', in_progress: 'Klar', ready: 'Leveret' };
const time = (d: string) => new Date(d).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });

export function OrdersBoard({ orders, onAdvance }: { orders: BoardOrder[]; onAdvance: (o: BoardOrder) => void }) {
  const [type, setType] = useState<'all' | 'towels' | 'room_service'>('all');
  const [room, setRoom] = useState('');
  const [q, setQ] = useState('');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const rooms = useMemo(() => [...new Set(orders.map(o => o.room_number))].sort(), [orders]);
  const list = orders.filter(o => (type === 'all' || o.type === type) && (!room || o.room_number === room) && (!q || `${o.room_number} ${o.details}`.toLowerCase().includes(q.toLowerCase())));
  const delayed = list.filter(o => isDelayed(o.status, o.updated_at ?? o.created_at, now)).length;
  const cancelled = list.filter(o => o.status === 'cancelled');
  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-3xl">Live ordrer</h2>
        {delayed > 0 && <span className="flex items-center gap-1 text-sm font-semibold text-destructive"><AlertTriangle className="h-4 w-4" />{delayed} forsinket</span>}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="relative block"><span className="sr-only">Søg i ordrer</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Søg værelse eller vare" className="w-full rounded-md border bg-card py-2 pl-9 pr-3 text-sm" /></label>
        <select aria-label="Filtrer type" value={type} onChange={e => setType(e.target.value as typeof type)} className="rounded-md border bg-card p-2 text-sm"><option value="all">Alle typer</option><option value="towels">Håndklæder</option><option value="room_service">Room service</option></select>
        <select aria-label="Filtrer værelse" value={room} onChange={e => setRoom(e.target.value)} className="rounded-md border bg-card p-2 text-sm"><option value="">Alle værelser</option>{rooms.map(r => <option key={r} value={r}>Værelse {r}</option>)}</select>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {COLS.map(c => { const items = list.filter(o => o.status === c.s); return (
          <div key={c.s} className={`min-w-0 rounded-lg border border-t-4 bg-card/60 p-3 ${c.cls}`}>
            <p className="flex items-center justify-between text-sm font-semibold"><span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />{ORDER_LABELS[c.s]}</span><span className="text-muted-foreground">{items.length}</span></p>
            <ul className="mt-3 space-y-2">
              {items.map(o => { const late = isDelayed(o.status, o.updated_at ?? o.created_at, now); return (
                <li key={o.id} className={`rounded-md border bg-background p-3 ${late ? 'border-destructive' : ''}`}>
                  <div className="flex items-start justify-between gap-2"><span className="font-display text-2xl leading-none">{o.room_number}</span><span className="text-xs text-muted-foreground">{time(o.created_at)}</span></div>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-brass">{o.type === 'towels' ? 'Håndklæder' : 'Room service'}</p>
                  <p className="break-words text-sm">{o.details}</p>
                  {late && <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-destructive"><AlertTriangle className="h-3 w-3" />Forsinket</p>}
                  {NEXT[o.status] && <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => onAdvance(o)}>{NEXT[o.status]}<ArrowRight /></Button>}
                </li>); })}
              {items.length === 0 && <li className="py-4 text-center text-xs text-muted-foreground">Ingen</li>}
            </ul>
          </div>); })}
      </div>
      {cancelled.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Annulleret af gæst: {cancelled.map(o => `${o.room_number} (${time(o.created_at)})`).join(', ')}</p>}
    </section>
  );
}
