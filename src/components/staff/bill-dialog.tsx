import { useState } from 'react';
import { Ban, Check, CreditCard, Pencil, Plus, Receipt, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { BILL_CATEGORIES, groupBill, lineTotal, type Bill, type BillCategory, type BillItem } from '@/lib/billing';
import { centsToInput, fmtDKK, parseDKK } from '@/lib/money';
import { card, dayTime, field, useAct, useStaffData } from '@/components/staff/core';
import { PaymentMethods, useLastMethod } from '@/components/staff/payment';

type Edit = { id: string; category: BillCategory; description: string; qty: string; price: string };

/** Gæstens regning: se poster, tilføje/rette/annullere, og registrere at regningen er betalt. Ingen check ind/ud her. */
export function BillDialog({ bookingId, onClose, onChanged }: { bookingId: string; onClose: () => void; onChanged?: () => void }) {
  const { data: bill, error, reload } = useStaffData<Bill>('staff_bill', { _booking: bookingId }, 8000);
  const act = useAct();
  const [edit, setEdit] = useState<Edit | null>(null);
  const [add, setAdd] = useState({ category: 'service' as BillCategory, description: '', qty: '1', price: '' });
  const [method, setMethod] = useLastMethod();
  const [note, setNote] = useState('');
  const [step, setStep] = useState<'bill' | 'pay'>('bill');
  const [busy, setBusy] = useState(false);

  const b = bill?.booking;
  const open = !!b && !b.checked_out_at;
  const changed = async () => { await reload(); onChanged?.(); };

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const price = parseDKK(add.price), qty = Number(add.qty);
    if (!add.description.trim()) { toast.error('Skriv en beskrivelse.'); return; }
    if (price === null) { toast.error('Skriv en gyldig pris, fx 45 eller 45,50.'); return; }
    if (!Number.isInteger(qty) || qty < 1) { toast.error('Antal skal være mindst 1.'); return; }
    setBusy(true);
    const r = await act('staff_bill_add', { _booking: bookingId, _category: add.category, _description: add.description, _qty: qty, _unit_cents: price }, 'Posten er tilføjet');
    setBusy(false);
    if (r.ok) { setAdd({ ...add, description: '', qty: '1', price: '' }); await changed(); }
  }
  async function saveEdit() {
    if (!edit) return;
    const price = parseDKK(edit.price), qty = Number(edit.qty);
    if (price === null || !Number.isInteger(qty) || qty < 1) { toast.error('Tjek antal og pris.'); return; }
    setBusy(true);
    const r = await act('staff_bill_edit', { _item: edit.id, _category: edit.category, _description: edit.description, _qty: qty, _unit_cents: price }, 'Posten er rettet');
    setBusy(false);
    if (r.ok) { setEdit(null); await changed(); }
  }
  async function voidItem(i: BillItem) {
    const reason = window.prompt(`Annuller "${i.description}"?\nSkriv evt. en årsag:`, '');
    if (reason === null) return;
    const r = await act('staff_bill_void', { _item: i.id, _reason: reason }, 'Posten er annulleret');
    if (r.ok) await changed();
  }
  async function accommodation() {
    const r = await act('staff_bill_add_accommodation', { _booking: bookingId }, 'Overnatning er lagt på regningen');
    if (r.ok) await changed();
  }
  async function pay() {
    setBusy(true);
    const r = await act('staff_bill_pay', { _booking: bookingId, _method: method, _note: note }, 'Regningen er registreret som betalt');
    setBusy(false);
    if (r.ok) { setStep('bill'); setNote(''); await changed(); }
  }

  const groups = bill ? groupBill(bill.items) : [];
  const due = bill?.due_cents ?? 0;
  const unpaidCount = bill?.items.filter(i => !i.voided_at && !i.paid).length ?? 0;

  const payView = bill && b && (
    <div className="space-y-5 p-5 text-center sm:p-6">
      <div>
        <DialogTitle className="text-2xl">Betaling</DialogTitle>
        <DialogDescription id="bill-desc" className="mt-1">{b.guest_name} · Værelse {b.room_number} · {b.reference}</DialogDescription>
      </div>
      <div className="rounded-2xl bg-secondary px-4 py-6">
        <p className="text-sm text-muted-foreground">Regning på {unpaidCount} {unpaidCount === 1 ? 'post' : 'poster'}</p>
        <p className="mt-1 font-display text-5xl tabular-nums" data-testid="pay-amount">{fmtDKK(due)}</p>
        {bill.paid_in_app_cents !== 0 && <p className="mt-1 text-xs text-muted-foreground">Allerede betalt: {fmtDKK(bill.paid_in_app_cents)}</p>}
      </div>
      <div><p className="mb-2 text-sm font-medium">Betalt via</p><PaymentMethods value={method} onChange={setMethod} /></div>
      <input aria-label="Note til betaling" placeholder="Note (valgfri)" className={field} value={note} onChange={e => setNote(e.target.value)} maxLength={500} />
      <p className="text-xs text-muted-foreground">HotelPilot tager ikke imod betaling. Tag betalingen i hotellets eget system, og tryk Betalt her. Gæsten bliver ikke tjekket ud.</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
        <Button variant="outline" onClick={() => setStep('bill')}>Tilbage til regningen</Button>
        <Button className="h-12 min-w-48 text-base" disabled={busy || !method} onClick={pay}><Check />Betalt · {fmtDKK(due)}</Button>
      </div>
    </div>
  );

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent aria-describedby="bill-desc" className="max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-3xl overflow-y-auto rounded-2xl p-0">
        {step === 'pay' && payView ? payView : <div className="space-y-5 p-5 sm:p-6">
          <div>
            <DialogTitle className="flex items-center gap-2 text-2xl"><Receipt className="h-5 w-5 text-brass" />Regning</DialogTitle>
            <DialogDescription id="bill-desc" className="mt-1">{b ? <>{b.guest_name} · Værelse {b.room_number} · {b.reference}</> : error ?? 'Henter…'}</DialogDescription>
          </div>

          {bill && (
            <div className="grid gap-2 sm:grid-cols-3" aria-label="Beløb">
              <div className="rounded-xl bg-secondary p-3"><p className="text-xs text-muted-foreground">Samlet</p><p className="font-display text-2xl tabular-nums">{fmtDKK(bill.total_cents)}</p></div>
              <div className="rounded-xl bg-secondary p-3"><p className="text-xs text-muted-foreground">Betalt</p><p className="font-display text-2xl tabular-nums text-status-clean">{fmtDKK(bill.paid_in_app_cents)}</p></div>
              <div className={`rounded-xl p-3 ${due > 0 ? 'bg-status-dirty/10' : 'bg-secondary'}`}><p className="text-xs text-muted-foreground">Til betaling</p><p className={`font-display text-2xl tabular-nums ${due > 0 ? 'text-status-dirty' : ''}`} data-testid="due">{fmtDKK(due)}</p></div>
            </div>
          )}
          {open && bill && due > 0 && <Button className="h-12 w-full text-base sm:w-auto" onClick={() => setStep('pay')}><CreditCard />Registrér betaling · {fmtDKK(due)}</Button>}
          {b?.checked_out_at && <p className="inline-flex items-center gap-1 rounded-full bg-status-clean/15 px-3 py-1 text-xs font-semibold text-status-clean"><Check className="h-3 w-3" />Opholdet er afsluttet, og regningen er gemt</p>}

          {bill && groups.length === 0 && <p className={`${card} text-center text-sm text-muted-foreground`}>Der er ingen poster på regningen endnu.</p>}
          {groups.map(g => (
            <section key={g.value}>
              <div className="flex items-baseline justify-between border-b pb-1"><h3 className="text-lg">{g.label}</h3><span className="text-sm font-semibold tabular-nums">{fmtDKK(g.subtotal)}</span></div>
              <ul className="divide-y">
                {g.items.map(i => (edit?.id === i.id ? (
                  <li key={i.id} className="grid gap-2 py-2 sm:grid-cols-[9rem_1fr_4rem_6rem_auto]">
                    <select aria-label="Kategori" className={field} value={edit.category} onChange={e => setEdit({ ...edit, category: e.target.value as BillCategory })}>{BILL_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
                    <input aria-label="Beskrivelse" className={field} value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} />
                    <input aria-label="Antal" inputMode="numeric" className={field} value={edit.qty} onChange={e => setEdit({ ...edit, qty: e.target.value })} />
                    <input aria-label="Pris pr. stk." inputMode="decimal" className={field} value={edit.price} onChange={e => setEdit({ ...edit, price: e.target.value })} />
                    <span className="flex gap-1"><Button size="sm" disabled={busy} onClick={saveEdit}><Check />Gem</Button><Button size="sm" variant="ghost" onClick={() => setEdit(null)} aria-label="Fortryd"><X /></Button></span>
                  </li>
                ) : (
                  <li key={i.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 ${i.voided_at ? 'text-muted-foreground' : ''}`}>
                    <span className={`min-w-0 flex-1 text-sm ${i.voided_at ? 'line-through' : ''}`}>
                      {i.description}
                      <span className="ml-2 text-xs text-muted-foreground no-underline">{i.quantity} × {fmtDKK(i.unit_price_cents)}</span>
                      {i.source === 'order' && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[11px]">Roomservice-ordre</span>}
                      {i.paid && !i.voided_at && <span className="ml-2 rounded-full bg-status-clean/15 px-2 py-0.5 text-[11px] text-status-clean">Betalt</span>}
                      {i.voided_at && <span className="ml-2 text-[11px] no-underline">Annulleret{i.void_reason ? `: ${i.void_reason}` : ''}</span>}
                    </span>
                    <span className={`w-24 text-right text-sm tabular-nums ${i.voided_at ? 'line-through' : ''}`}>{fmtDKK(lineTotal(i))}</span>
                    {open && !i.voided_at && !i.paid && (
                      <span className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Ret ${i.description}`} onClick={() => setEdit({ id: i.id, category: i.category, description: i.description, qty: String(i.quantity), price: centsToInput(i.unit_price_cents) })}><Pencil /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Annuller ${i.description}`} onClick={() => voidItem(i)}><Ban /></Button>
                      </span>
                    )}
                  </li>
                )))}
              </ul>
            </section>
          ))}

          {open && (
            <form onSubmit={addItem} className={`${card} space-y-3`} aria-label="Tilføj post">
              <div className="flex items-center justify-between"><h3 className="text-lg">Tilføj post</h3>
                {!bill?.items.some(i => i.category === 'accommodation' && !i.voided_at) && <Button type="button" size="sm" variant="outline" onClick={accommodation}>Tilføj overnatning</Button>}
              </div>
              <div className="grid gap-2 sm:grid-cols-[9rem_1fr_4rem_6rem_auto]">
                <select aria-label="Kategori" className={field} value={add.category} onChange={e => setAdd({ ...add, category: e.target.value as BillCategory })}>{BILL_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
                <input aria-label="Beskrivelse" placeholder="Beskrivelse" className={field} value={add.description} onChange={e => setAdd({ ...add, description: e.target.value })} />
                <input aria-label="Antal" inputMode="numeric" className={field} value={add.qty} onChange={e => setAdd({ ...add, qty: e.target.value })} />
                <input aria-label="Pris pr. stk." placeholder="Pris" inputMode="decimal" className={field} value={add.price} onChange={e => setAdd({ ...add, price: e.target.value })} />
                <Button disabled={busy}><Plus />Tilføj</Button>
              </div>
              <p className="text-xs text-muted-foreground">Brug minus foran prisen til en kreditering, fx -50.</p>
            </form>
          )}

          {bill?.payments && bill.payments.length > 0 && (
            <section>
              <h3 className="border-b pb-1 text-lg">Betalinger</h3>
              <ul className="divide-y text-sm">
                {bill.payments.map(p => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{dayTime(p.created_at)} · {p.method || '–'}{p.paid_by ? ` · ${p.paid_by}` : ''}{p.kind === 'checkout' ? ' · ved tjek ud' : ''}{p.note ? ` · ${p.note}` : ''}</span><span className="font-semibold tabular-nums">{fmtDKK(p.amount_cents)}</span></li>)}
              </ul>
            </section>
          )}
          {error && !bill && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Luk</Button></div>
        </div>}
      </DialogContent>
    </Dialog>
  );
}
