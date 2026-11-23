import { BedDouble, CalendarPlus, ClipboardCheck, LogIn, LogOut, Receipt, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmtDKK } from '@/lib/money';
import { PageTitle, Stat, card, hm, useStaff } from '@/components/staff/core';

/** Hurtigt overblik: dagens ankomster og afrejser, belægning, opgaver, nye ordrer, omsætning og genveje. */
export function DashboardPage() {
  const { dash, go, openBill, me } = useStaff();
  if (!dash) return <p className="py-10 text-center text-sm text-muted-foreground">Henter overblik…</p>;
  const pct = dash.rooms_total ? Math.round((dash.occupied / dash.rooms_total) * 100) : 0;
  const arrivalsLeft = dash.arrivals.filter(a => !a.checked_in_at).length;
  const departuresLeft = dash.departures.filter(d => !d.checked_out_at).length;
  return (
    <>
      <PageTitle title={me ? `Hej ${me.name.split(' ')[0]}` : 'Dashboard'} hint={new Date().toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' })} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Ankomster i dag" icon={LogIn} value={dash.arrivals.length} sub={`${arrivalsLeft} ikke tjekket ind`} onClick={() => go('guests', 'arrivals')} />
        <Stat label="Afrejser i dag" icon={LogOut} value={dash.departures.length} sub={`${departuresLeft} mangler checkout`} onClick={() => { go('guests', 'arrivals'); }} />
        <div className={card}>
          <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Belægning</p><BedDouble className="h-4 w-4 text-muted-foreground" /></div>
          <p className="mt-2 font-display text-4xl leading-none tabular-nums">{pct}%</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${dash.occupied} af ${dash.rooms_total} værelser er optaget`}><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
          <p className="mt-2 text-xs text-muted-foreground">{dash.occupied} optaget · {dash.free} ledige af {dash.rooms_total}</p>
        </div>
        <Stat label="Dagens omsætning" icon={Receipt} value={fmtDKK(dash.revenue_today_cents)} sub={`${fmtDKK(dash.unsettled_cents)} står åbent på regninger`} onClick={() => go('sales')} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Stat label="Uafsluttede opgaver" icon={ClipboardCheck} value={dash.open_tasks} tone={dash.open_tasks > 0 ? 'warn' : 'ok'} sub={`${dash.rooms_to_clean} værelser skal rengøres`} onClick={() => go('tasks')} />
        <Stat label="Nye roomserviceordrer" icon={UtensilsCrossed} value={dash.new_orders} tone={dash.new_orders > 0 ? 'warn' : 'ok'} sub={`${dash.open_orders} åbne i alt`} onClick={() => go('orders')} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr_18rem]">
        <section className={card}>
          <h2 className="text-xl">Ankomster</h2>
          <ul className="mt-2 divide-y text-sm">
            {dash.arrivals.map(a => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0"><b>Værelse {a.room_number}</b> · {a.guest_name}<span className="block text-xs text-muted-foreground">fra {hm(a.starts_at)} · {a.guests} {a.guests === 1 ? 'gæst' : 'gæster'}</span></span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${a.checked_in_at ? 'bg-status-clean/15 text-status-clean' : 'bg-secondary'}`}>{a.checked_in_at ? 'Tjekket ind' : 'Venter'}</span>
              </li>
            ))}
            {dash.arrivals.length === 0 && <li className="py-4 text-center text-muted-foreground">Ingen ankomster i dag</li>}
          </ul>
        </section>
        <section className={card}>
          <h2 className="text-xl">Afrejser</h2>
          <ul className="mt-2 divide-y text-sm">
            {dash.departures.map(d => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0"><b>Værelse {d.room_number}</b> · {d.guest_name}<span className="block text-xs text-muted-foreground">senest {hm(d.ends_at)}</span></span>
                {d.checked_out_at
                  ? <span className="shrink-0 rounded-full bg-status-clean/15 px-2 py-0.5 text-xs text-status-clean">Tjekket ud</span>
                  : <Button size="sm" variant="outline" onClick={() => openBill(d.id)}>Regning</Button>}
              </li>
            ))}
            {dash.departures.length === 0 && <li className="py-4 text-center text-muted-foreground">Ingen afrejser i dag</li>}
          </ul>
        </section>
        <section className={card}>
          <h2 className="text-xl">Hurtige handlinger</h2>
          <div className="mt-3 grid gap-2">
            <Button onClick={() => go('sales')}><Receipt />Nyt salg</Button>
            <Button variant="outline" onClick={() => go('guests', 'arrivals')}><LogOut />Ankomster & afrejser</Button>
            <Button variant="outline" onClick={() => go('orders')}><UtensilsCrossed />Se ordrer</Button>
            <Button variant="outline" onClick={() => go('tasks')}><ClipboardCheck />Rengøring</Button>
            <Button variant="outline" onClick={() => go('guests', 'reservations')}><CalendarPlus />Ny reservation</Button>
          </div>
        </section>
      </div>
    </>
  );
}
