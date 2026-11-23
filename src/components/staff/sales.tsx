import { useMemo, useState } from 'react';
import { Check, Minus, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { BILL_CATEGORIES, categoryLabel, lineTotal, type BillCategory } from '@/lib/billing';
import { centsToInput, fmtDKK, parseDKK } from '@/lib/money';
import { PageTitle, card, field, hm, todayIso, useAct, useStaff, useStaffData } from '@/components/staff/core';
import type { GuestRow } from '@/components/staff/guests';
import { HistoryView } from '@/components/staff/history';

type MenuData = { categories: { id: string; name: string; active: boolean }[]; items: { id: string; category_id: string; name: string; price_cents: number; active: boolean }[] };
type SaleLine = { key: string; description: string; qty: number; price: string };
type SaleRow = { id: string; booking_id: string; room_number: string; category: BillCategory; description: string; quantity: number; unit_price_cents: number; voided_at: string | null; guest_name: string; created_at: string };

/** Registrér salg af produkter og services og læg dem på en gæsts regning (vælg gæst eller værelse). Ingen kortbetaling i HotelPilot. */
function NewSale() {
  const { openBill } = useStaff();
  const act = useAct();
  const guests = useStaffData<GuestRow[]>('staff_guests', {}, 15000);
  const menu = useStaffData<MenuData>('staff_menu');
  const today = useStaffData<SaleRow[]>('staff_history', { _kind: 'sales', _q: '', _from: todayIso(), _to: todayIso() }, 10000);
  const [q, setQ] = useState('');
  const [targets, setTargets] = useState<string[]>([]);
  const [account, setAccount] = useState<BillCategory>('restaurant_bar');
  const [catId, setCatId] = useState<string | null>(null);
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [custom, setCustom] = useState({ description: '', price: '', qty: '1' });
  const [busy, setBusy] = useState(false);

  const inHouse = useMemo(() => (guests.data ?? []).filter(g => g.in_house).sort((a, b) => a.room_number.localeCompare(b.room_number, 'da', { numeric: true })), [guests.data]);
  const matches = inHouse.filter(g => `${g.room_number} ${g.guest_name}`.toLowerCase().includes(q.trim().toLowerCase()));
  const chosen = inHouse.filter(g => targets.includes(g.id));
  const toggle = (id: string) => setTargets(t => (t.includes(id) ? t.filter(x => x !== id) : [...t, id]));
  const roomsText = chosen.map(g => g.room_number).join(', ');
  const cats = (menu.data?.categories ?? []).filter(c => c.active);
  const cat = cats.find(c => c.id === catId) ?? cats[0];
  const items = (menu.data?.items ?? []).filter(i => i.active && i.category_id === cat?.id);
  const total = lines.reduce((s, l) => s + l.qty * (parseDKK(l.price) ?? 0), 0);

  function addLine(description: string, priceCents: number, qty = 1) {
    setLines(ls => {
      const key = `${description}|${priceCents}`;
      return ls.some(l => l.key === key) ? ls.map(l => (l.key === key ? { ...l, qty: l.qty + qty } : l)) : [...ls, { key, description, qty, price: centsToInput(priceCents) }];
    });
  }
  function addCustom(e: React.FormEvent) {
    e.preventDefault();
    const price = parseDKK(custom.price), qty = Number(custom.qty);
    if (!custom.description.trim() || price === null || !Number.isInteger(qty) || qty < 1) { toast.error('Skriv beskrivelse, antal og en gyldig pris.'); return; }
    addLine(custom.description.trim(), price, qty);
    setCustom({ description: '', price: '', qty: '1' });
  }
  async function submit() {
    if (chosen.length === 0) { toast.error('Vælg først en gæst eller et værelse.'); return; }
    if (lines.some(l => parseDKK(l.price) === null)) { toast.error('En af linjerne har en ugyldig pris.'); return; }
    setBusy(true);
    // Hver valgt regning får alle linjer. Fejler en, stopper vi, og det der allerede er lagt på, fjernes fra kurven.
    const work = chosen.flatMap(g => lines.map(l => ({ g, l })));
    let done = 0;
    for (const { g, l } of work) {
      const r = await act('staff_bill_add', { _booking: g.id, _category: account, _description: l.description, _qty: l.qty, _unit_cents: parseDKK(l.price) });
      if (!r.ok) break;
      done++;
    }
    setBusy(false);
    if (done === work.length) { toast.success(`${done} ${done === 1 ? 'post' : 'poster'} lagt på regningen · Værelse ${roomsText}`); setLines([]); setTargets([]); }
    else toast.error(`${done} af ${work.length} poster blev lagt på. Tjek regningerne, før du prøver igen.`);
    await Promise.all([guests.reload(), today.reload()]);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        <section className={card}>
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-xl">1. Hvem skal have regningen?</h2>
            {chosen.length > 0 && <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setTargets([])}>Fjern alle ({chosen.length})</button>}</div>
          <p className="mt-1 text-xs text-muted-foreground">Tryk på et værelse for at vælge det, og tryk igen for at fjerne det. Du kan vælge flere.</p>
          <label className="relative mt-3 block"><span className="sr-only">Søg gæst eller værelse</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Skriv værelsesnummer eller navn" className={`${field} pl-9`} /></label>
          <div className="mt-3 flex max-h-44 flex-wrap gap-2 overflow-y-auto" role="group" aria-label="Gæster">
            {matches.map(g => <Button key={g.id} type="button" size="sm" role="checkbox" aria-checked={targets.includes(g.id)} variant={targets.includes(g.id) ? 'default' : 'outline'} onClick={() => toggle(g.id)}>{targets.includes(g.id) && <Check />}{g.room_number} · {g.guest_name}</Button>)}
            {matches.length === 0 && <p className="text-sm text-muted-foreground">{guests.data ? 'Ingen boende gæster matcher.' : 'Henter…'}</p>}
          </div>
        </section>

        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl">2. Hvad er solgt?</h2>
            <label className="flex items-center gap-2 text-sm">Konto<select aria-label="Konto" className={field} value={account} onChange={e => setAccount(e.target.value as BillCategory)}>{BILL_CATEGORIES.filter(c => c.value !== 'accommodation').map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
          </div>
          {cats.length > 0 && (
            <>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Produktkategorier">{cats.map(c => <Button key={c.id} size="sm" className="shrink-0 rounded-full" variant={cat?.id === c.id ? 'default' : 'outline'} aria-pressed={cat?.id === c.id} onClick={() => setCatId(c.id)}>{c.name}</Button>)}</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {items.map(i => <button key={i.id} type="button" onClick={() => addLine(i.name, i.price_cents)} className="rounded-lg border p-3 text-left transition hover:bg-accent active:scale-[0.99]"><span className="block text-sm font-semibold">{i.name}</span><span className="text-xs text-muted-foreground">{fmtDKK(i.price_cents)}</span></button>)}
                {items.length === 0 && <p className="text-sm text-muted-foreground">Ingen aktive produkter i kategorien.</p>}
              </div>
            </>
          )}
          <form onSubmit={addCustom} className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-[1fr_4rem_6rem_auto]" aria-label="Egen post">
            <input aria-label="Beskrivelse" placeholder="Andet produkt eller service" className={field} value={custom.description} onChange={e => setCustom({ ...custom, description: e.target.value })} />
            <input aria-label="Antal" inputMode="numeric" className={field} value={custom.qty} onChange={e => setCustom({ ...custom, qty: e.target.value })} />
            <input aria-label="Pris pr. stk." placeholder="Pris" inputMode="decimal" className={field} value={custom.price} onChange={e => setCustom({ ...custom, price: e.target.value })} />
            <Button variant="outline"><Plus />Tilføj</Button>
          </form>
        </section>

        <section className={card} aria-label="Salget">
          <h2 className="text-xl">3. Læg på regningen</h2>
          <ul className="mt-2 divide-y">
            {lines.map(l => (
              <li key={l.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="min-w-0 flex-1 text-sm">{l.description}</span>
                <span className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-8 w-8" aria-label={`Færre ${l.description}`} onClick={() => setLines(ls => ls.map(x => (x.key === l.key ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}><Minus /></Button>
                  <span className="w-6 text-center text-sm tabular-nums">{l.qty}</span>
                  <Button size="icon" variant="outline" className="h-8 w-8" aria-label={`Flere ${l.description}`} onClick={() => setLines(ls => ls.map(x => (x.key === l.key ? { ...x, qty: Math.min(999, x.qty + 1) } : x)))}><Plus /></Button>
                </span>
                <input aria-label={`Pris for ${l.description}`} inputMode="decimal" className={`${field} w-24`} value={l.price} onChange={e => setLines(ls => ls.map(x => (x.key === l.key ? { ...x, price: e.target.value } : x)))} />
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Fjern ${l.description}`} onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))}><Trash2 /></Button>
              </li>
            ))}
            {lines.length === 0 && <li className="py-4 text-center text-sm text-muted-foreground">Tryk på et produkt ovenfor for at tilføje det.</li>}
          </ul>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <span className="text-lg font-semibold tabular-nums">{fmtDKK(total)}{chosen.length > 1 && <span className="ml-2 text-sm font-normal text-muted-foreground">pr. regning · i alt {fmtDKK(total * chosen.length)}</span>}</span>
            <Button disabled={busy || lines.length === 0 || chosen.length === 0} onClick={submit}>{chosen.length === 0 ? 'Vælg gæst først' : chosen.length === 1 ? `Læg på regning · Værelse ${roomsText}` : `Læg på ${chosen.length} regninger · ${roomsText}`}</Button>
          </div>
        </section>
      </div>

      <aside className={`${card} self-start`}>
        <h2 className="text-xl">Dagens salg</h2>
        <ul className="mt-2 divide-y text-sm">
          {(today.data ?? []).filter(s => !s.voided_at).slice(0, 25).map(s => (
            <li key={s.id}><button type="button" onClick={() => openBill(s.booking_id)} className="flex w-full items-start justify-between gap-3 py-2 text-left hover:bg-accent">
              <span className="min-w-0"><span className="block truncate">{s.quantity > 1 ? `${s.quantity}× ` : ''}{s.description}</span><span className="text-xs text-muted-foreground">{hm(s.created_at)} · Værelse {s.room_number} · {categoryLabel(s.category)}</span></span>
              <span className="shrink-0 tabular-nums">{fmtDKK(lineTotal({ quantity: s.quantity, unit_price_cents: s.unit_price_cents }))}</span>
            </button></li>
          ))}
          {(today.data ?? []).length === 0 && <li className="py-6 text-center text-muted-foreground">Intet solgt i dag endnu</li>}
        </ul>
      </aside>
    </div>
  );
}

export function SalesPage() {
  const [tab, setTab] = useState<'new' | 'history'>('new');
  return (
    <>
      <PageTitle title="Salg" hint="Læg salg på gæsternes regninger, og find tidligere regninger, salg og ordrer." actions={
        <div className="flex rounded-lg border p-0.5" role="tablist">
          {([['new', 'Nyt salg'], ['history', 'Historik']] as const).map(([t, l]) => <Button key={t} size="sm" role="tab" aria-selected={tab === t} variant={tab === t ? 'default' : 'ghost'} onClick={() => setTab(t)}>{l}</Button>)}
        </div>} />
      {tab === 'new' ? <NewSale /> : <HistoryView />}
    </>
  );
}
