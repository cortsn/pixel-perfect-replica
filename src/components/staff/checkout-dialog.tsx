import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { groupBill, lineTotal, type Bill } from '@/lib/billing';
import { rpc } from '@/lib/cleaning';
import { errorText } from '@/lib/hotel';
import { fmtDKK } from '@/lib/money';
import { field, useStaff, useStaffData } from '@/components/staff/core';
import type { GuestRow } from '@/components/staff/guests';
import { PaymentMethods, useLastMethod } from '@/components/staff/payment';

/**
 * Tjek ud, så hurtigt som muligt: beløbet står stort, betalingsmåden er forvalgt (den sidst brugte), og knappen har fokus.
 * Tryk Betalt (eller Enter), så er gæsten tjekket ud, regningen gemt, værelset sat til rengøring og rengøringsopgaven oprettet.
 */
export function CheckoutDialog({ bookingId, onClose, onOpenBill }: { bookingId: string; onClose: () => void; onOpenBill: () => void }) {
  const { pin, go, reloadDash } = useStaff();
  const { data: bill, error, reload } = useStaffData<Bill>('staff_bill', { _booking: bookingId }, 5000);
  const [method, setMethod] = useLastMethod();
  const [note, setNote] = useState('');
  const [items, setItems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openOrders, setOpenOrders] = useState(false);
  const guests = useStaffData<GuestRow[]>('staff_guests', {}, 5000);
  const blocked = openOrders || (guests.data?.find(g => g.id === bookingId)?.open_orders ?? 0) > 0;
  const b = bill?.booking;
  const due = bill?.due_cents ?? 0;
  const alreadyOut = !!b?.checked_out_at;
  const notStarted = !!b && Date.parse(b.starts_at) > Date.now();

  async function checkout() {
    if (busy) return;
    setBusy(true);
    const { error: e } = await rpc('staff_checkout', { _pin: pin, _booking: bookingId, _method: due > 0 ? method : '', _note: note });
    setBusy(false);
    if (e) {
      if (e.message?.includes('OPEN_ORDERS')) { setOpenOrders(true); return; }
      toast.error(errorText(e));
      return;
    }
    toast.success(`Værelse ${b?.room_number ?? ''} er tjekket ud og sat til rengøring`);
    reloadDash();
    onClose();
  }

  const groups = bill ? groupBill(bill.items) : [];
  const live = bill?.items.filter(i => !i.voided_at) ?? [];
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent aria-describedby="co-desc" className="max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-lg overflow-y-auto rounded-2xl p-5 sm:p-6">
        <div className="text-center">
          <DialogTitle className="flex items-center justify-center gap-2 text-2xl"><LogOut className="h-5 w-5 text-brass" />Tjek ud{b ? ` · Værelse ${b.room_number}` : ''}</DialogTitle>
          <DialogDescription id="co-desc" className="mt-1">{b ? `${b.guest_name} · ${b.reference}` : error ?? 'Henter…'}</DialogDescription>
        </div>
        {bill && b && (
          <div className="space-y-4">
            <div className={`rounded-2xl px-4 py-5 text-center ${due > 0 ? 'bg-secondary' : 'bg-status-clean/10'}`}>
              <p className="text-sm text-muted-foreground">{due > 0 ? `Til betaling · ${live.filter(i => !i.paid).length} ${live.filter(i => !i.paid).length === 1 ? 'post' : 'poster'}` : 'Intet at betale'}</p>
              <p className={`mt-1 font-display text-5xl tabular-nums ${due > 0 ? '' : 'text-status-clean'}`} data-testid="checkout-amount">{fmtDKK(due)}</p>
              {bill.paid_in_app_cents > 0 && <p className="mt-1 text-xs text-muted-foreground">Allerede betalt: {fmtDKK(bill.paid_in_app_cents)}</p>}
            </div>

            <div>
              <button type="button" aria-expanded={items} onClick={() => setItems(v => !v)} className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span>Se regningen ({live.length} {live.length === 1 ? 'post' : 'poster'} · samlet {fmtDKK(bill.total_cents)})</span><ChevronDown className={`h-4 w-4 transition-transform ${items ? 'rotate-180' : ''}`} />
              </button>
              {items && (
                <ul className="mt-2 max-h-48 divide-y overflow-y-auto rounded-lg border px-3 text-sm">
                  {groups.flatMap(g => g.items).filter(i => !i.voided_at).map(i => <li key={i.id} className="flex justify-between gap-3 py-1.5"><span className="min-w-0 break-words">{i.quantity > 1 ? `${i.quantity}× ` : ''}{i.description}{i.paid && <span className="ml-2 text-xs text-status-clean">betalt</span>}</span><span className="shrink-0 tabular-nums">{fmtDKK(lineTotal(i))}</span></li>)}
                  {live.length === 0 && <li className="py-2 text-muted-foreground">Ingen poster</li>}
                </ul>
              )}
            </div>

            {blocked && (
              <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />Der er uafsluttede roomserviceordrer. Lever eller afvis dem, før gæsten tjekker ud.</p>
                <div className="flex gap-2"><Button size="sm" onClick={() => { onClose(); go('orders'); }}>Gå til ordrer</Button><Button size="sm" variant="outline" onClick={() => { setOpenOrders(false); void reload(); void guests.reload(); }}>Opdater</Button></div>
              </div>
            )}
            {notStarted && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">Opholdet er ikke startet endnu, så gæsten kan ikke tjekkes ud.</p>}
            {alreadyOut && <p role="status" className="rounded-lg bg-status-clean/10 p-3 text-sm text-status-clean">Gæsten er allerede tjekket ud.</p>}

            {due > 0 && !alreadyOut && <div><p className="mb-2 text-center text-sm font-medium">Betalt via</p><PaymentMethods value={method} onChange={setMethod} /></div>}
            {!alreadyOut && <input aria-label="Note til tjek ud" placeholder="Note (valgfri)" className={field} value={note} onChange={e => setNote(e.target.value)} maxLength={500} />}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <div className="flex gap-2"><Button variant="outline" onClick={onClose}>Annuller</Button><Button variant="ghost" onClick={() => { onClose(); onOpenBill(); }}>Ret regning</Button></div>
              <Button autoFocus className="h-12 min-w-56 text-base" disabled={busy || alreadyOut || notStarted || blocked || !method} onClick={checkout}>
                <Check />{due > 0 ? `Betalt · ${fmtDKK(due)} & tjek ud` : 'Tjek ud'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
