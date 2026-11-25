import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { isDemoBackend } from '@/lib/cleaning';
import { nextOrderStatus } from '@/lib/hotel';
import { OrdersBoard, type BoardOrder } from '@/components/hotel/orders-board';
import { PageTitle, card, useAct, useStaffData } from '@/components/staff/core';
import { RejectOrderDialog } from '@/components/staff/reject-dialog';
import { DEFAULT_REJECT_MESSAGE } from '@/lib/hotel';

/** Hotellets standardbesked, der er forudfyldt, når en ordre afvises. */
function RejectMessageEditor() {
  const act = useAct();
  const { data, reload } = useStaffData<{ roomservice: { reject_message?: string } | null }>('staff_settings');
  const saved = data?.roomservice?.reject_message ?? DEFAULT_REJECT_MESSAGE;
  const [text, setText] = useState<string | null>(null);
  const value = text ?? saved;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = await act('staff_set_reject_message', { _message: value.trim() }, 'Standardbeskeden er gemt');
    if (r.ok) { setText(null); await reload(); }
  }
  return (
    <details className={`${card} mt-4 max-w-2xl`}>
      <summary className="cursor-pointer text-sm font-semibold">Standardbesked ved afvisning</summary>
      <form onSubmit={save} className="mt-3 space-y-2">
        <p className="text-xs text-muted-foreground">Denne tekst står allerede i feltet, når du trykker Afvis. Du kan altid rette den for den enkelte ordre.</p>
        <textarea value={value} onChange={e => setText(e.target.value.slice(0, 200))} rows={2} className="w-full rounded-md border bg-background p-3 text-sm" aria-label="Standardbesked ved afvisning" />
        <Button size="sm" disabled={!value.trim() || value.trim() === saved}>Gem standardbesked</Button>
      </form>
    </details>
  );
}

/** Ordreoversigt (modtag, accepter, afvis, skift status ny → leveret) og administration af menuen. */
function Orders() {
  const act = useAct();
  const { data, error, reload } = useStaffData<BoardOrder[]>('staff_orders', { _limit: 150 }, 5000);
  useEffect(() => {
    if (isDemoBackend()) return;
    const ch = supabase.channel(`staff-orders-${Math.random().toString(36).slice(2)}`).on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { void reload(); }).subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [reload]);
  async function advance(o: BoardOrder) {
    const next = nextOrderStatus(o.status);
    const r = await act('staff_set_order_status', { _order: o.id, _status: next }, next === 'done' ? `Værelse ${o.room_number}: leveret og lagt på regningen` : undefined);
    if (r.ok) await reload();
  }
  const [rejecting, setRejecting] = useState<BoardOrder | null>(null);
  if (!data) return <p className="py-10 text-center text-sm text-muted-foreground">{error ?? 'Henter ordrer…'}</p>;
  const orders = data.filter(o => o.type === 'room_service'); // håndklæde-bytte er en opgave og ligger under Opgaver
  return (
    <>
      <OrdersBoard orders={orders} onAdvance={advance} onReject={setRejecting} />
      <RejectMessageEditor />
      {rejecting && <RejectOrderDialog order={rejecting} onClose={() => setRejecting(null)} onDone={() => void reload()} />}
      <p className="mt-4 text-xs text-muted-foreground">Når en roomservice-ordre sættes til <b>Leveret</b>, lægges den automatisk på gæstens regning.</p>
    </>
  );
}

export function OrdersPage() {
  return (
    <>
      <PageTitle title="Ordrer" hint="Modtag og behandl roomservice-ordrer fra gæsterne. Leverede ordrer lægges automatisk på gæstens regning." />
      <Orders />
    </>
  );
}
