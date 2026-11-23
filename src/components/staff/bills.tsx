import { useMemo, useState } from 'react';
import { Receipt, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { categoryLabel } from '@/lib/billing';
import { fmtDKK } from '@/lib/money';
import { PageTitle, card, dayTime, field, useDebounced, useStaff, useStaffData } from '@/components/staff/core';
import type { GuestRow } from '@/components/staff/guests';

/** Regninger: hvad er hvert værelses regning på lige nu? Åbn en regning for at se posterne og registrere betaling. */
export function BillsPage() {
  const { openBill } = useStaff();
  const { data, error } = useStaffData<GuestRow[]>('staff_guests', {}, 8000);
  const [q, setQ] = useState('');
  const [onlyDue, setOnlyDue] = useState(true);
  const all = data ?? [];
  const rows = useMemo(() => all
    .filter(g => (onlyDue ? (g.balance_cents ?? 0) > 0 : (g.total_cents ?? g.balance_cents ?? 0) !== 0 || g.in_house) && `${g.guest_name} ${g.room_number} ${g.reference}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (b.balance_cents ?? 0) - (a.balance_cents ?? 0)), [all, q, onlyDue]);
  const owed = all.reduce((s, g) => s + Math.max(0, g.balance_cents ?? 0), 0);
  const open = all.filter(g => (g.balance_cents ?? 0) > 0).length;
  return (
    <>
      <PageTitle title="Regninger" hint="Det mangler gæsterne at betale. Tjek ud sker under Ankomster & afrejser." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className={card}><p className="text-sm text-muted-foreground">Til betaling i alt</p><p className="mt-2 font-display text-4xl leading-none tabular-nums">{fmtDKK(owed)}</p></div>
        <div className={card}><p className="text-sm text-muted-foreground">Åbne regninger</p><p className="mt-2 font-display text-4xl leading-none tabular-nums">{open}</p></div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative block min-w-56 flex-1 sm:max-w-sm"><span className="sr-only">Søg regning</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Søg værelse, navn eller booking" className={`${field} pl-9`} /></label>
        <div className="flex gap-1.5" role="group" aria-label="Vis">
          <Button size="sm" variant={onlyDue ? 'default' : 'outline'} aria-pressed={onlyDue} onClick={() => setOnlyDue(true)}>Mangler betaling</Button>
          <Button size="sm" variant={!onlyDue ? 'default' : 'outline'} aria-pressed={!onlyDue} onClick={() => setOnlyDue(false)}>Alle regninger</Button>
        </div>
      </div>
      <div className={`${card} overflow-x-auto p-0`}>
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="border-b text-muted-foreground"><tr>{['Værelse', 'Gæst', 'Samlet', 'Betalt', 'Til betaling', ''].map(h => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody className="divide-y">
            {rows.map(g => {
              const total = g.total_cents ?? g.balance_cents ?? 0, due = g.balance_cents ?? 0;
              return (
                <tr key={g.id}>
                  <td className="px-4 py-3 font-display text-2xl">{g.room_number}</td>
                  <td className="px-4 py-3"><span className="font-semibold">{g.guest_name}</span><span className="block text-xs text-muted-foreground">{g.reference}</span></td>
                  <td className="px-4 py-3 tabular-nums">{fmtDKK(total)}</td>
                  <td className="px-4 py-3 tabular-nums text-status-clean">{fmtDKK(total - due)}</td>
                  <td className={`px-4 py-3 font-semibold tabular-nums ${due > 0 ? 'text-status-dirty' : ''}`}>{fmtDKK(due)}</td>
                  <td className="px-4 py-3 text-right"><Button size="sm" variant={due > 0 ? 'default' : 'outline'} onClick={() => openBill(g.id)}><Receipt />Åben regning</Button></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">{error ?? (data ? (onlyDue ? 'Ingen regninger mangler at blive betalt' : 'Ingen regninger') : 'Henter…')}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

type Payment = {
  id: string; booking_id: string; room_number: string; amount_cents: number; method: string; note: string; paid_by: string; kind: 'bill' | 'checkout'; created_at: string; guest_name: string; reference: string;
  items: { description: string; quantity: number; unit_price_cents: number; category: string }[];
};

/** En betalt regning: poster, beløb og hvordan og hvornår den blev betalt. */
function ReceiptDialog({ p, onClose }: { p: Payment; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent aria-describedby="rc-desc" className="max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-lg overflow-y-auto rounded-2xl p-5 sm:p-6">
        <DialogTitle className="flex items-center gap-2 text-2xl"><Receipt className="h-5 w-5 text-brass" />Betalt regning</DialogTitle>
        <DialogDescription id="rc-desc">{p.guest_name} · Værelse {p.room_number} · {p.reference}</DialogDescription>
        <ul className="divide-y text-sm">
          {p.items.map((i, k) => <li key={k} className="flex justify-between gap-3 py-2"><span className="min-w-0 break-words">{i.quantity > 1 ? `${i.quantity}× ` : ''}{i.description}<span className="block text-xs text-muted-foreground">{categoryLabel(i.category)}</span></span><span className="shrink-0 tabular-nums">{fmtDKK(i.quantity * i.unit_price_cents)}</span></li>)}
          {p.items.length === 0 && <li className="py-2 text-muted-foreground">Posterne er ikke gemt for denne betaling.</li>}
        </ul>
        <div className="flex items-baseline justify-between border-t pt-3 text-lg font-semibold"><span>Betalt</span><span className="tabular-nums">{fmtDKK(p.amount_cents)}</span></div>
        <p className="text-xs text-muted-foreground">{dayTime(p.created_at)} · {p.method || '–'}{p.paid_by ? ` · registreret af ${p.paid_by}` : ''}{p.kind === 'checkout' ? ' · betalt ved tjek ud' : ''}{p.note ? ` · ${p.note}` : ''}</p>
        <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Luk</Button></div>
      </DialogContent>
    </Dialog>
  );
}

/** Historik: allerede betalte regninger for alle værelser. Søg på gæst, værelse eller bookingnummer, og begræns på dato. */
export function BillHistory() {
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState<Payment | null>(null);
  const dq = useDebounced(q);
  const { data, error, loading } = useStaffData<Payment[]>('staff_payments', { _q: dq.trim(), _from: from || null, _to: to || null }, 15000);
  const rows = data ?? [];
  const sum = rows.reduce((s, p) => s + p.amount_cents, 0);
  return (
    <>
      <PageTitle title="Historik" hint="Betalte regninger for alle værelser." />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="relative block min-w-56 flex-1 sm:max-w-sm"><span className="sr-only">Søg</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Gæst, værelse eller bookingnummer" className={`${field} pl-9`} /></label>
        <label className="text-xs text-muted-foreground">Fra<input type="date" value={from} onChange={e => setFrom(e.target.value)} className={`${field} mt-1 block`} /></label>
        <label className="text-xs text-muted-foreground">Til<input type="date" value={to} onChange={e => setTo(e.target.value)} className={`${field} mt-1 block`} /></label>
        {(q || from || to) && <Button variant="ghost" size="sm" onClick={() => { setQ(''); setFrom(''); setTo(''); }}>Nulstil</Button>}
      </div>
      <div className={`${card} overflow-x-auto p-0`}>
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b text-muted-foreground"><tr>{['Betalt', 'Værelse', 'Gæst', 'Beløb', 'Betalt via', 'Af', ''].map(h => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody className="divide-y">
            {rows.map(p => (
              <tr key={p.id}>
                <td className="px-4 py-3 text-xs">{dayTime(p.created_at)}</td>
                <td className="px-4 py-3 font-display text-xl">{p.room_number}</td>
                <td className="px-4 py-3"><b>{p.guest_name}</b><span className="block text-xs text-muted-foreground">{p.reference}{p.kind === 'checkout' ? ' · ved tjek ud' : ''}</span></td>
                <td className="px-4 py-3 font-semibold tabular-nums">{fmtDKK(p.amount_cents)}</td>
                <td className="px-4 py-3 text-xs">{p.method || '–'}</td>
                <td className="px-4 py-3 text-xs">{p.paid_by}</td>
                <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => setOpen(p)}>Se regning</Button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">{error ?? (loading ? 'Henter…' : 'Ingen betalte regninger matcher')}</td></tr>}
          </tbody>
        </table>
      </div>
      {rows.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{rows.length} {rows.length === 1 ? 'regning' : 'regninger'} · i alt {fmtDKK(sum)}{rows.length >= 300 ? ' · viser de seneste 300' : ''}</p>}
      {open && <ReceiptDialog p={open} onClose={() => setOpen(null)} />}
    </>
  );
}
