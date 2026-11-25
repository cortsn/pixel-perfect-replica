import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DEFAULT_REJECT_MESSAGE } from '@/lib/hotel';
import { useAct, useStaffData } from '@/components/staff/core';

type Settings = { roomservice: { reject_message?: string } | null };
export type RejectTarget = { id: string; room_number: string; details?: string };

/** Afvis en ordre: årsagen er forudfyldt med hotellets standardbesked og kan rettes, før gæsten får den. */
export function RejectOrderDialog({ order, onClose, onDone }: { order: RejectTarget; onClose: () => void; onDone: () => void }) {
  const act = useAct();
  const { data } = useStaffData<Settings>('staff_settings');
  const standard = data?.roomservice?.reject_message || DEFAULT_REJECT_MESSAGE;
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data && reason === null) setReason(standard); }, [data, reason, standard]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || reason === null) return;
    setBusy(true);
    const r = await act('staff_set_order_status', { _order: order.id, _status: 'rejected', _reason: reason.trim() }, `Værelse ${order.room_number}: ordren er afvist`);
    setBusy(false);
    if (r.ok) { onDone(); onClose(); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent aria-describedby="rej-desc" className="w-[calc(100%-1.5rem)] max-w-md rounded-2xl">
        <DialogTitle className="text-xl">Afvis ordre · værelse {order.room_number}</DialogTitle>
        <DialogDescription id="rej-desc">{order.details ? `${order.details.split(' — Note:')[0]}. ` : ''}Gæsten får besked med årsagen herunder.</DialogDescription>
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm font-medium">Årsag til gæsten
            <textarea autoFocus value={reason ?? ''} onChange={e => setReason(e.target.value.slice(0, 200))} rows={3} className="mt-1 w-full rounded-md border bg-background p-3 text-base" />
          </label>
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={reason === standard} onClick={() => setReason(standard)}>Brug standardbesked</Button>
            <div className="flex gap-2"><Button type="button" variant="outline" onClick={onClose}>Annuller</Button><Button type="submit" variant="destructive" disabled={busy || !reason?.trim()}>Afvis ordre</Button></div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
