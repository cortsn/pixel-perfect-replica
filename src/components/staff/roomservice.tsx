import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isDemoBackend } from '@/lib/cleaning';
import { nextOrderStatus } from '@/lib/hotel';
import { OrdersBoard, type BoardOrder } from '@/components/hotel/orders-board';
import { PageTitle, useAct, useStaffData } from '@/components/staff/core';

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
  async function reject(o: BoardOrder) {
    const reason = window.prompt(`Afvis ordren til værelse ${o.room_number}?\nSkriv en kort årsag, gæsten kan se (fx "Udsolgt"):`, '');
    if (reason === null) return;
    const r = await act('staff_set_order_status', { _order: o.id, _status: 'rejected', _reason: reason }, 'Ordren er afvist');
    if (r.ok) await reload();
  }
  if (!data) return <p className="py-10 text-center text-sm text-muted-foreground">{error ?? 'Henter ordrer…'}</p>;
  const orders = data.filter(o => o.type === 'room_service'); // håndklæde-bytte er en opgave og ligger under Opgaver
  return (
    <>
      <OrdersBoard orders={orders} onAdvance={advance} onReject={reject} />
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
