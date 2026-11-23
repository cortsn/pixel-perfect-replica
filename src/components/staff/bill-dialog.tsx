import { useState } from 'react';
import { Ban, Check, LogIn, LogOut, Mail, Pencil, Plus, Receipt, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { BILL_CATEGORIES, PAYMENT_METHODS, groupBill, lineTotal, type Bill, type BillCategory, type BillItem } from '@/lib/billing';
import { centsToInput, fmtDKK, parseDKK } from '@/lib/money';
import { card, dayTime, field, hm, useAct, useStaffData } from '@/components/staff/core';
import { TimeWheelDialog } from '@/components/hotel/time-wheel';

type Edit = { id: string; category: BillCategory; description: string; qty: string; price: string };

/** Gæstens samlede regning: se, tilføje, redigere og annullere poster, og tjek ud når regningen er betalt via hotellets betalingssystem. */
export function BillDialog({ bookingId, onClose, onChanged }: { bookingId: string; onClose: () => void; onChanged?: () => void }) {
  const { data: bill, error, reload } = useStaffData<Bill>('staff_bill', { _booking: bookingId }, 8000);
  const act = useAct();
  const [edit, setEdit] = useState<Edit | null>(null);
  const [add, setAdd] = useState({ category: 'service' as BillCategory, description: '', qty: '1', price: '' });
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [note, setNote] = useState('');
  const [step, setStep] = useState<'bill' | 'pay'>('bill');
  const [busy, setBusy] = useState(false);
  const [wheel, setWheel] = useState<'start' | 'end' | null>(null);

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
  async function checkIn() {
    setBusy(true);
    const r = await act('staff_check_in', { _booking: bookingId }, 'Gæsten er tjekket ind');
    setBusy(false);
    if (r.ok) await changed();
  }
  async function saveTimes(starts: Date, ends: Date) {
    const r = await act('staff_set_stay', { _booking: bookingId, _starts: starts.toISOString(), _ends: ends.toISOString() }, 'Tiden er ændret. Gæsten får besked i appen.');
    if (r.ok) await changed();
  }
  async function checkout() {
    setBusy(true);
    const r = await act('staff_checkout', { _booking: bookingId, _method: method, _note: note }, 'Gæsten er tjekket ud. Værelset er sat til rengøring.');
    setBusy(false);
    if (r.ok) { setStep('bill'); await changed(); }
  }

  const needsMethod = (bill?.due_cents ?? 0) > 0;
  const activeCount = bill?.items.filter(i => !i.voided_at).length ?? 0;
  const payView = bill && b && (
    <div className="space-y-5 p-5 text-center sm:p-6">
      <div>
        <DialogTitle className="text-2xl">Betaling</DialogTitle>
        <DialogDescription id="bill-desc" className="mt-1">{b.guest_name} · Værelse {b.room_number} · {b.reference}</DialogDescription>
      </div>
      <div className="rounded-2xl bg-secondary px-4 py-6">
        <p className="text-sm text-muted-foreground">Regning på {activeCount} {activeCount === 1 ? 'post' : 'poster'}</p>
        <p className="mt-1 font-display text-5xl tabular-nums" data-testid="pay-amount">{fmtDKK(bill.due_cents)}</p>
        {bill.paid_in_app_cents !== 0 && <p className="mt-1 text-xs text-muted-foreground">Betalt i appen: {fmtDKK(bill.paid_in_app_cents)} (er trukket fra)</p>}
      </div>
      {needsMethod && (
        <div>
          <p className="mb-2 text-sm font-medium">Betalt via</p>
          <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Betalt via">
            {PAYMENT_METHODS.map(m => <Button key={m} type="button" size="sm" role="radio" aria-checked={method === m} variant={method === m ? 'default' : 'outline'} onClick={() => setMethod(m)}>{method === m && <Check />}{m}</Button>)}
          </div>
        </div>
      )}
      <input aria-label="Note til checkout" placeholder="Note (valgfri)" className={field} value={note} onChange={e => setNote(e.target.value)} maxLength={500} />
      <p className="text-xs text-muted-foreground">Når du trykker Betalt, afsluttes opholdet, regningen gemmes i historikken, værelset sættes til rengøring, og en rengøringsopgave oprettes.</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
        <Button variant="outline" onClick={() => setStep('bill')}>Tilbage til regningen</Button>
        <Button className="h-12 min-w-48 text-base" disabled={busy || (needsMethod && !method)} onClick={checkout}><Check />{needsMethod ? `Betalt · ${fmtDKK(bill.due_cents)}` : 'Afslut checkout'}</Button>
      </div>
    </div>
  );
  const groups = bill ? groupBill(bill.items) : [];
  const nowMs = Date.now();
  const started = !!b && Date.parse(b.starts_at) <= nowMs;
  const ended = !!b && Date.parse(b.ends_at) <= nowMs;
  const overdue = open && ended;
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent aria-describedby="bill-desc" className="max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-3xl overflow-y-auto rounded-2xl p-0">
        {step === 'pay' && payView ? payView : <div className="space-y-5 p-5 sm:p-6">
          <div>
            <DialogTitle className="flex items-center gap-2 text-2xl"><Receipt className="h-5 w-5 text-brass" />Gæst & regning</DialogTitle>
            <DialogDescription id="bill-desc" className="mt-1">{b ? 'Ophold, regning og check ind/ud samlet ét sted.' : error ?? 'Henter…'}</DialogDescription>
          </div>
          {b && (
            <section className={`${card} space-y-3`} aria-label="Gæst og ophold">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xl font-semibold leading-tight">{b.guest_name}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                    <span>Værelse <b className="text-foreground">{b.room_number}</b></span><span>{b.reference}</span>
                    <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{b.guests} {b.guests === 1 ? 'gæst' : 'gæster'}</span>
                    {b.guest_email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{b.guest_email}</span>}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${b.checked_out_at ? 'bg-status-clean/15 text-status-clean' : overdue ? 'bg-status-dirty/15 text-status-dirty' : b.checked_in_at ? 'bg-status-clean/15 text-status-clean' : 'bg-secondary'}`}>
                  {b.checked_out_at ? `Tjekket ud ${hm(b.checked_out_at)}` : overdue ? 'Skal tjekkes ud' : b.checked_in_at ? `Tjekket ind ${hm(b.checked_in_at)}` : started ? 'Ikke tjekket ind' : 'Ankommer'}
                </span>
              </div>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary/60 px-3 py-2"><div><dt className="text-xs text-muted-foreground">Check ind</dt><dd className="font-medium">{dayTime(b.starts_at)}</dd></div>
                  {open && !b.checked_in_at && !started && <Button size="sm" variant="outline" onClick={() => setWheel('start')}><Pencil />Ændr</Button>}</div>
                <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary/60 px-3 py-2"><div><dt className="text-xs text-muted-foreground">Check ud</dt><dd className="font-medium">{dayTime(b.ends_at)}</dd></div>
                  {open && <Button size="sm" variant="outline" onClick={() => setWheel('end')}><Pencil />Ændr</Button>}</div>
              </dl>
              {open && (
                <div className="flex flex-wrap gap-2">
                  {!b.checked_in_at && !ended && <Button disabled={busy} onClick={checkIn}><LogIn />Tjek ind</Button>}
                  {started && <Button variant={overdue || b.checked_in_at ? 'default' : 'outline'} onClick={() => setStep('pay')}><LogOut />Tjek ud · {fmtDKK(bill?.due_cents ?? 0)}</Button>}
                </div>
              )}
              {b.checked_out_at && <p className="inline-flex items-center gap-1 text-xs font-semibold text-status-clean"><Check className="h-3 w-3" />Opholdet er afsluttet, og regningen er gemt i historikken.</p>}
            </section>
          )}

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
                      {i.paid && <span className="ml-2 rounded-full bg-status-clean/15 px-2 py-0.5 text-[11px] text-status-clean">Betalt i appen</span>}
                      {i.voided_at && <span className="ml-2 text-[11px] no-underline">Annulleret{i.void_reason ? `: ${i.void_reason}` : ''}</span>}
                    </span>
                    <span className={`w-24 text-right text-sm tabular-nums ${i.voided_at ? 'line-through' : ''}`}>{fmtDKK(lineTotal(i))}</span>
                    {open && !i.voided_at && (
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

          {bill && (
            <div className="space-y-1 rounded-xl bg-secondary p-4 text-sm">
              {bill.paid_in_app_cents !== 0 && <div className="flex justify-between text-muted-foreground"><span>Betalt i appen</span><span className="tabular-nums">{fmtDKK(bill.paid_in_app_cents)}</span></div>}
              <div className="flex justify-between text-muted-foreground"><span>Samlet beløb</span><span className="tabular-nums">{fmtDKK(bill.total_cents)}</span></div>
              <div className="flex items-baseline justify-between text-xl font-semibold"><span>{open ? 'Til betaling' : 'Samlet betalt'}</span><span className="tabular-nums" data-testid="due">{fmtDKK(bill.due_cents)}</span></div>
            </div>
          )}

          {open && bill && (
            <section className={`${card} space-y-3`}>
              <h3 className="flex items-center gap-2 text-lg"><LogOut className="h-4 w-4 text-brass" />Tjek ud</h3>
              <p className="text-sm text-muted-foreground">Gennemgå regningen, og gå derefter til betaling. HotelPilot tager ikke imod betaling: gæsten betaler i hotellets eget betalingssystem, og du registrerer det bagefter.</p>
              <Button className="w-full sm:w-auto" onClick={() => setStep('pay')}>Gå til betaling · {fmtDKK(bill.due_cents)}</Button>
            </section>
          )}
          {error && !bill && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Luk</Button></div>
        </div>}
      </DialogContent>
      {wheel && b && (
        <TimeWheelDialog
          title={wheel === 'start' ? 'Ny check ind-tid' : 'Ny check ud-tid'}
          description={`${b.guest_name} · Værelse ${b.room_number}. Gæsten får besked i appen.`}
          value={new Date(wheel === 'start' ? b.starts_at : b.ends_at)}
          validate={d => wheel === 'start'
            ? (d.getTime() >= Date.parse(b.ends_at) ? 'Check ind skal være før check ud.' : null)
            : (d.getTime() <= Date.parse(b.starts_at) ? 'Check ud skal være efter check ind.' : d.getTime() <= Date.now() ? 'Check ud-tiden skal ligge i fremtiden.' : null)}
          onClose={() => setWheel(null)}
          onSave={d => { setWheel(null); void saveTimes(wheel === 'start' ? d : new Date(b.starts_at), wheel === 'end' ? d : new Date(b.ends_at)); }}
        />
      )}
    </Dialog>
  );
}

