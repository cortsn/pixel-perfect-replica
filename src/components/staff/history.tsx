import { useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ORDER_LABELS, type OrderStatus } from '@/lib/hotel';
import { categoryLabel, lineTotal } from '@/lib/billing';
import { fmtDKK } from '@/lib/money';
import { card, dayTime, field, useDebounced, useStaff, useStaffData } from '@/components/staff/core';

type Kind = 'checkouts' | 'sales' | 'orders';
type Checkout = { id: string; booking_id: string; reference: string; room_number: string; guest_name: string; guests: number; starts_at: string; ends_at: string; total_cents: number; due_cents: number; payment_method: string; checked_out_by: string; created_at: string };
type Sale = { id: string; booking_id: string; room_number: string; category: string; description: string; quantity: number; unit_price_cents: number; paid: boolean; voided_at: string | null; created_by: string; created_at: string; guest_name: string; reference: string };
type Ord = { id: string; room_number: string; type: string; details: string; status: OrderStatus; total_cents: number; created_at: string; guest_name: string | null; reference: string | null };

const th = 'px-4 py-3 font-normal';
/** Find tidligere regninger, salg og ordrer via gæst, værelse eller dato. */
export function HistoryView() {
  const { openBill } = useStaff();
  const [kind, setKind] = useState<Kind>('checkouts');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const dq = useDebounced(q);
  const { data, error, loading } = useStaffData<(Checkout | Sale | Ord)[]>('staff_history', { _kind: kind, _q: dq.trim(), _from: from || null, _to: to || null });
  const rows = data ?? [];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex rounded-lg border p-0.5" role="tablist" aria-label="Vis">
          {([['checkouts', 'Regninger'], ['sales', 'Salg'], ['orders', 'Ordrer']] as const).map(([k, l]) => <Button key={k} size="sm" role="tab" aria-selected={kind === k} variant={kind === k ? 'default' : 'ghost'} onClick={() => setKind(k)}>{l}</Button>)}
        </div>
        <label className="relative block min-w-56 flex-1 sm:max-w-sm"><span className="sr-only">Søg</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Gæst, værelse eller bookingnummer" className={`${field} pl-9`} /></label>
        <label className="text-xs text-muted-foreground">Fra<input type="date" value={from} onChange={e => setFrom(e.target.value)} className={`${field} mt-1 block`} /></label>
        <label className="text-xs text-muted-foreground">Til<input type="date" value={to} onChange={e => setTo(e.target.value)} className={`${field} mt-1 block`} /></label>
        {(q || from || to) && <Button variant="ghost" size="sm" onClick={() => { setQ(''); setFrom(''); setTo(''); }}>Nulstil</Button>}
      </div>
      <div className={`${card} overflow-x-auto p-0`}>
        <table className="w-full min-w-[44rem] text-left text-sm">
          {kind === 'checkouts' && <><thead className="border-b text-muted-foreground"><tr>{['Tjekket ud', 'Værelse', 'Gæst', 'Total', 'Betalt via', 'Af', ''].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody className="divide-y">{(rows as Checkout[]).map(c => (
              <tr key={c.id}><td className="px-4 py-3 text-xs">{dayTime(c.created_at)}</td><td className="px-4 py-3 font-display text-xl">{c.room_number}</td><td className="px-4 py-3"><b>{c.guest_name}</b><span className="block text-xs text-muted-foreground">{c.reference}</span></td>
                <td className="px-4 py-3 tabular-nums">{fmtDKK(c.total_cents)}</td><td className="px-4 py-3 text-xs">{c.payment_method || '–'}</td><td className="px-4 py-3 text-xs">{c.checked_out_by}</td>
                <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => openBill(c.booking_id)}>Åbn regning</Button></td></tr>))}</tbody></>}
          {kind === 'sales' && <><thead className="border-b text-muted-foreground"><tr>{['Tid', 'Værelse', 'Gæst', 'Post', 'Beløb', ''].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody className="divide-y">{(rows as Sale[]).map(s => (
              <tr key={s.id} className={s.voided_at ? 'text-muted-foreground line-through' : ''}><td className="px-4 py-3 text-xs">{dayTime(s.created_at)}</td><td className="px-4 py-3 font-display text-xl">{s.room_number}</td><td className="px-4 py-3">{s.guest_name}</td>
                <td className="px-4 py-3">{s.quantity > 1 ? `${s.quantity}× ` : ''}{s.description}<span className="block text-xs text-muted-foreground no-underline">{categoryLabel(s.category)} · {s.created_by || 'system'}</span></td>
                <td className="px-4 py-3 tabular-nums">{fmtDKK(lineTotal({ quantity: s.quantity, unit_price_cents: s.unit_price_cents }))}</td>
                <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => openBill(s.booking_id)}>Regning</Button></td></tr>))}</tbody></>}
          {kind === 'orders' && <><thead className="border-b text-muted-foreground"><tr>{['Tid', 'Værelse', 'Gæst', 'Ordre', 'Status', 'Beløb'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody className="divide-y">{(rows as Ord[]).map(o => (
              <tr key={o.id}><td className="px-4 py-3 text-xs">{dayTime(o.created_at)}</td><td className="px-4 py-3 font-display text-xl">{o.room_number}</td><td className="px-4 py-3">{o.guest_name ?? '–'}</td>
                <td className="max-w-xs px-4 py-3 break-words">{o.type === 'towels' ? 'Poolhåndklæder' : o.details}</td><td className="px-4 py-3"><span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{ORDER_LABELS[o.status] ?? o.status}</span></td>
                <td className="px-4 py-3 tabular-nums">{o.total_cents ? fmtDKK(o.total_cents) : '–'}</td></tr>))}</tbody></>}
          {rows.length === 0 && <tbody><tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">{error ?? (loading ? 'Henter…' : 'Ingen resultater')}</td></tr></tbody>}
        </table>
      </div>
      {rows.length >= 300 && <p className="mt-2 text-xs text-muted-foreground">Viser de seneste 300. Indsnævr med søgning eller datoer.</p>}
    </>
  );
}
