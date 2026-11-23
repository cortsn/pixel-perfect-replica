import { useEffect, useState } from 'react';
import { Check, Clock, Minus, Plus, ReceiptText, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HotelModal } from '@/components/hotel/modal';
import { fmtDKK } from '@/lib/money';
import { useMenuImage } from '@/lib/menu-images';
import { MAX_QTY, addToCart, cartCount, cartTotal, hoursText, lineLabel, setLineQty, toOrderLines, unitPrice, type CartLine, type GuestMenu, type MenuItem } from '@/lib/menu';

type Lines = ReturnType<typeof toOrderLines>;
type Submit = (lines: Lines, note: string) => void | boolean | Promise<void | boolean>;

function Stepper({ n, name, onChange }: { n: number; name: string; onChange: (n: number) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button type="button" size="icon" variant="outline" aria-label={`Færre ${name}`} onClick={() => onChange(n - 1)}><Minus /></Button>
      <span className="w-6 text-center tabular-nums" aria-label={`Antal ${name}`}>{n}</span>
      <Button type="button" size="icon" variant="outline" aria-label={`Flere ${name}`} disabled={n >= MAX_QTY} onClick={() => onChange(n + 1)}><Plus /></Button>
    </div>
  );
}

function Thumb({ item }: { item: MenuItem }) {
  const src = useMenuImage(item);
  const [bad, setBad] = useState(false);
  if (!src || bad) return null;
  return <img src={src} alt="" loading="lazy" width={64} height={64} onError={() => setBad(true)} className="h-16 w-16 shrink-0 rounded-lg object-cover" />;
}

/** Vælg variant og tilvalg for en vare, før den lægges i kurven. */
function ItemConfig({ item, onAdd, onClose }: { item: MenuItem; onAdd: (variant: string | null, addons: string[], qty: number) => void; onClose: () => void }) {
  const [variant, setVariant] = useState<string | null>(item.variants[0]?.name ?? null);
  const [addons, setAddons] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const toggle = (n: string) => setAddons(a => (a.includes(n) ? a.filter(x => x !== n) : [...a, n]));
  return (
    <HotelModal title={item.name} onClose={onClose}>
      {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
      {item.variants.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Vælg</legend>
          <div className="space-y-2" role="radiogroup">
            {item.variants.map(v => (
              <button key={v.name} type="button" role="radio" aria-checked={variant === v.name} onClick={() => setVariant(v.name)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm ${variant === v.name ? 'border-primary bg-primary/10 font-semibold' : ''}`}>
                <span className="flex items-center gap-2">{variant === v.name && <Check className="h-4 w-4 text-primary" />}{v.name}</span>
                <span className="text-muted-foreground">{v.price_delta_cents === 0 ? 'inkl.' : `${v.price_delta_cents > 0 ? '+' : ''}${fmtDKK(v.price_delta_cents)}`}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {item.addons.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Tilvalg</legend>
          <div className="space-y-2">
            {item.addons.map(a => (
              <button key={a.name} type="button" role="checkbox" aria-checked={addons.includes(a.name)} onClick={() => toggle(a.name)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm ${addons.includes(a.name) ? 'border-primary bg-primary/10 font-semibold' : ''}`}>
                <span className="flex items-center gap-2">{addons.includes(a.name) && <Check className="h-4 w-4 text-primary" />}{a.name}</span>
                <span className="text-muted-foreground">+{fmtDKK(a.price_cents)}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex items-center justify-between"><span className="text-sm font-semibold">Antal</span><Stepper n={qty} name={item.name} onChange={n => setQty(Math.max(1, n))} /></div>
      <Button className="h-12 w-full" onClick={() => onAdd(variant, addons, qty)}>Tilføj · {fmtDKK(qty * unitPrice(item, variant, addons))}</Button>
    </HotelModal>
  );
}

/** Roomservice: menuen kommer fra hotellet (opdateres live). Bestillingen lægges på gæstens regning og betales ved check ud. */
export function RoomService({ room, menu, busy, onSubmit }: { room: string; menu: GuestMenu | null; busy?: boolean; onSubmit: Submit }) {
  const cats = menu?.categories.filter(c => c.items.length > 0) ?? [];
  const [catId, setCatId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [note, setNote] = useState('');
  const [step, setStep] = useState<'menu' | 'cart'>('menu');
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const cat = cats.find(c => c.id === catId) ?? cats[0];
  const total = cartTotal(cart);
  const count = cartCount(cart);
  const open = !!menu?.settings && menu.settings.enabled && menu.settings.open_now;
  // Menuen kan ændre sig, mens gæsten bestiller: fjern varer, der ikke findes længere, og opdater priser.
  useEffect(() => {
    if (!menu) return;
    const live = new Map(menu.categories.flatMap(c => c.items).map(i => [i.id, i]));
    setCart(c => {
      const next = c.filter(l => live.has(l.item.id)).map(l => ({ ...l, item: live.get(l.item.id)! }));
      return next.length === c.length && next.every((l, i) => l.item === c[i]!.item) ? c : next;
    });
  }, [menu]);
  useEffect(() => { if (cart.length === 0 && step === 'cart') setStep('menu'); }, [cart.length, step]);

  if (!menu) return <p className="py-6 text-center text-sm text-muted-foreground">Henter menuen…</p>;
  const closedBanner = !open && (
    <p role="status" className="flex items-start gap-2 rounded-lg bg-secondary p-3 text-sm"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-brass" />
      {menu.settings && !menu.settings.enabled ? 'Roomservice er lukket lige nu.' : `Roomservice er lukket. Vi åbner kl. ${menu.settings?.opens_at ?? ''}.`}</p>
  );

  async function submit() {
    const ok = await onSubmit(toOrderLines(cart), note);
    if (ok === false) return;
    setCart([]); setNote(''); setStep('menu');
  }

  if (step === 'cart') {
    return (
      <>
        <p className="text-sm text-muted-foreground">Din kurv · leveres til værelse {room}</p>
        {closedBanner}
        <ul className="divide-y">
          {cart.map(l => (
            <li key={l.key} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0"><span className="block break-words font-semibold">{lineLabel(l)}</span><span className="text-xs text-muted-foreground">{fmtDKK(unitPrice(l.item, l.variant, l.addons))} pr. stk.</span></span>
              <Stepper n={l.qty} name={l.item.name} onChange={n => setCart(c => setLineQty(c, l.key, n))} />
            </li>
          ))}
        </ul>
        <label className="block text-sm">Note til køkkenet (valgfri)<textarea value={note} onChange={e => setNote(e.target.value.slice(0, 200))} rows={2} placeholder="fx uden løg" className="mt-1 w-full rounded-md border bg-card p-2" /></label>
        <div className="space-y-1 rounded-lg bg-secondary p-3 text-sm">
          <div className="flex justify-between font-semibold"><span>I alt</span><span>{fmtDKK(total)}</span></div>
          <p className="flex items-start gap-2 text-muted-foreground"><ReceiptText className="mt-0.5 h-4 w-4 shrink-0" />Lægges på din regning og betales ved check ud.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep('menu')}>Tilføj mere</Button>
          <Button className="h-12 flex-1" disabled={busy || count === 0 || !open} onClick={submit}>Bestil · {fmtDKK(total)}</Button>
        </div>
      </>
    );
  }
  if (cats.length === 0) return <>{closedBanner}<p className="py-6 text-center text-sm text-muted-foreground">Menuen er tom lige nu.</p></>;
  return (
    <>
      {closedBanner}
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Kategorier">
        {cats.map(c => <Button key={c.id} type="button" size="sm" variant={cat?.id === c.id ? 'default' : 'outline'} aria-pressed={cat?.id === c.id} className="shrink-0 rounded-full" onClick={() => setCatId(c.id)}>{c.name}</Button>)}
      </div>
      <ul className="divide-y">
        {cat?.items.map(i => {
          const avail = open && i.available_now;
          const inCart = cart.filter(l => l.item.id === i.id).reduce((s, l) => s + l.qty, 0);
          return (
            <li key={i.id} className={`flex items-center gap-3 py-3 ${avail ? '' : 'opacity-60'}`}>
              <Thumb item={i} />
              <span className="min-w-0 flex-1">
                <span className="block break-words font-semibold">{i.name}</span>
                {i.description && <span className="block text-xs text-muted-foreground">{i.description}</span>}
                <span className="block text-sm">{i.variants.length > 0 ? 'fra ' : ''}{fmtDKK(i.price_cents + (i.variants.length ? Math.min(...i.variants.map(v => v.price_delta_cents)) : 0))}</span>
                {!i.available_now && <span className="text-xs text-muted-foreground">Serveres {hoursText(i.available_from, i.available_to)}</span>}
              </span>
              <Button type="button" size="icon" variant={inCart ? 'default' : 'outline'} disabled={!avail} aria-label={`Tilføj ${i.name}`}
                onClick={() => (i.variants.length || i.addons.length ? setPicking(i) : setCart(c => addToCart(c, i, null, [], 1)))}>
                {inCart ? <span className="text-sm font-semibold tabular-nums">{inCart}</span> : <Plus />}
              </Button>
            </li>
          );
        })}
      </ul>
      <Button className="sticky bottom-0 h-12 w-full" disabled={count === 0} onClick={() => setStep('cart')}>
        <ShoppingBag />{count === 0 ? 'Vælg noget fra menuen' : `Se kurv · ${count} ${count === 1 ? 'vare' : 'varer'} · ${fmtDKK(total)}`}
      </Button>
      {picking && <ItemConfig item={picking} onClose={() => setPicking(null)} onAdd={(v, a, q) => { setCart(c => addToCart(c, picking, v, a, q)); setPicking(null); }} />}
    </>
  );
}
