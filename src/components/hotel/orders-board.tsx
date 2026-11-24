import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ORDER_LABELS, type OrderStatus } from '@/lib/hotel';
import { fmtDKK } from '@/lib/money';

export type BoardOrder = {
  id: string; room_number: string; type: string; details: string; status: OrderStatus; created_at: string; updated_at?: string; quantity?: number;
  total_cents?: number; guest_name?: string | null; reject_reason?: string; items?: { name: string; qty: number; unit_cents: number }[];
};
type Section = 'pending' | 'accepted' | 'in_progress' | 'ready' | 'done';
const SECTIONS: { s: Section; dot: string; edge: string }[] = [
  { s: 'pending', dot: 'bg-status-dirty', edge: 'border-l-status-dirty' },
  { s: 'accepted', dot: 'bg-primary', edge: 'border-l-primary' },
  { s: 'in_progress', dot: 'bg-status-cleaning', edge: 'border-l-status-cleaning' },
  { s: 'ready', dot: 'bg-status-occupied', edge: 'border-l-status-occupied' },
  { s: 'done', dot: 'bg-status-clean', edge: 'border-l-status-clean' },
];
const NEXT: Partial<Record<OrderStatus, string>> = { pending: 'Accepter', accepted: 'Start', in_progress: 'Klar', ready: 'Leveret' };
/** Hvor længe ordren har ventet: "12 min" eller "1 t 5 min". */
const waited = (d: string, now: number) => { const m = Math.max(0, Math.floor((now - Date.parse(d)) / 60000)); return m < 1 ? 'lige bestilt' : m >= 60 ? `${Math.floor(m / 60)} t ${m % 60} min` : `${m} min`; };
const time = (d: string) => new Date(d).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
/** "2× Club sandwich, 1× Kaffe — Note: uden løg" → varer og note hver for sig. */
const splitDetails = (d: string) => { const [items, note] = d.split(' — Note:'); return { items: items ?? '', note: note?.trim() ?? '' }; };

/** Live ordrer: én sammenklappelig sektion pr. status. Den ordre, der har ventet længst, ligger øverst. "Ny" og "I gang" er åbne fra start. */
export function OrdersBoard({ orders, onAdvance, onReject }: { orders: BoardOrder[]; onAdvance: (o: BoardOrder) => void; onReject?: (o: BoardOrder) => void }) {
  const [room, setRoom] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<Section, boolean>>({ pending: true, accepted: false, in_progress: true, ready: false, done: false });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const rooms = useMemo(() => [...new Set(orders.map(o => o.room_number))].sort((a, b) => a.localeCompare(b, 'da', { numeric: true })), [orders]);
  const list = orders.filter(o => (!room || o.room_number === room) && (!q || `${o.room_number} ${o.details} ${o.guest_name ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  const cancelled = list.filter(o => o.status === 'cancelled');
  const rejected = list.filter(o => o.status === 'rejected');
  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-3xl">Live ordrer</h2>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="relative block"><span className="sr-only">Søg i ordrer</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Søg værelse, gæst eller vare" className="w-full rounded-md border bg-card py-2 pl-9 pr-3 text-sm" /></label>
        <select aria-label="Filtrer værelse" value={room} onChange={e => setRoom(e.target.value)} className="rounded-md border bg-card p-2 text-sm"><option value="">Alle værelser</option>{rooms.map(r => <option key={r} value={r}>Værelse {r}</option>)}</select>
      </div>

      <div className="mt-4 space-y-2">
        {SECTIONS.map(({ s, dot, edge }) => {
          const items = list.filter(o => o.status === s).sort((a, b) => (s === 'done' ? Date.parse(b.created_at) - Date.parse(a.created_at) : Date.parse(a.created_at) - Date.parse(b.created_at)));
          const isOpen = open[s];
          return (
            <div key={s} className="rounded-lg border bg-card/60">
              <button type="button" aria-expanded={isOpen} aria-controls={`orders-${s}`} onClick={() => setOpen(o => ({ ...o, [s]: !o[s] }))} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                <span className={`h-3 w-3 shrink-0 rounded-full ${dot}`} />
                <span className="flex-1 text-sm font-semibold">{ORDER_LABELS[s]}</span>
                <span className={`min-w-6 rounded-full px-2 py-0.5 text-center text-xs font-semibold tabular-nums ${items.length ? 'bg-secondary' : 'text-muted-foreground'}`}>{items.length}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div id={`orders-${s}`} className="border-t p-2">
                  {items.length === 0
                    ? <p className="py-3 text-center text-xs text-muted-foreground">Ingen ordrer</p>
                    : <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {items.map(o => {
                        const d = splitDetails(o.details);
                        return (
                          <li key={o.id} className={`flex flex-col rounded-md border border-l-4 bg-background p-2.5 ${edge}`}>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="font-display text-2xl leading-none">{o.room_number}</span>
                              <span className="text-right text-xs text-muted-foreground">Bestilt {time(o.created_at)}{s !== 'done' && <span className="block font-semibold text-foreground">{waited(o.created_at, now)}</span>}</span>
                            </div>
                            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-brass">Room service</p>
                            {o.items && o.items.length > 0
                              ? <ul className="mt-0.5 text-sm leading-snug">{o.items.map((l, i) => <li key={i} className="break-words">{l.qty}× {l.name}</li>)}</ul>
                              : <p className="mt-0.5 break-words text-sm leading-snug">{d.items}</p>}
                            {d.note && <p className="mt-0.5 break-words text-xs italic text-muted-foreground">Note: {d.note}</p>}
                            <p className="mt-1 text-xs text-muted-foreground">{o.guest_name ?? 'Gæst'}{o.total_cents ? ` · ${fmtDKK(o.total_cents)}` : ''}</p>
                            {NEXT[o.status] && (
                              <div className="mt-2 flex gap-1.5 pt-0.5">
                                <Button size="sm" variant={o.status === 'pending' ? 'default' : 'outline'} className="h-8 flex-1" onClick={() => onAdvance(o)}>{NEXT[o.status]}<ArrowRight /></Button>
                                {o.status === 'pending' && onReject && <Button size="sm" variant="outline" className="h-8 text-destructive" onClick={() => onReject(o)}>Afvis</Button>}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {rejected.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Afvist: {rejected.map(o => `${o.room_number} (${time(o.created_at)}${o.reject_reason ? `, ${o.reject_reason}` : ''})`).join(', ')}</p>}
      {cancelled.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Annulleret af gæst: {cancelled.map(o => `${o.room_number} (${time(o.created_at)})`).join(', ')}</p>}
    </section>
  );
}
