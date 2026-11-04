import { useState } from 'react';
import { Minus, Plus, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MENU = [
  { cat: 'Mad', name: 'Club sandwich' },
  { cat: 'Mad', name: 'Caesar salat' },
  { cat: 'Mad', name: 'Dagens suppe' },
  { cat: 'Snacks', name: 'Pommes frites' },
  { cat: 'Drikke', name: 'Flaske rødvin' },
  { cat: 'Drikke', name: 'Kaffe & croissant' },
];
const CATS = [...new Set(MENU.map(i => i.cat))];

export function orderText(cart: Record<string, number>, note: string) {
  const lines = MENU.filter(i => cart[i.name]).map(i => `${cart[i.name]}× ${i.name}`).join(', ');
  return note.trim() ? `${lines} — Note: ${note.trim()}` : lines;
}

function Stepper({ n, name, onChange }: { n: number; name: string; onChange: (n: number) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button type="button" size="icon" variant="outline" aria-label={`Færre ${name}`} onClick={() => onChange(n - 1)}><Minus /></Button>
      <span className="w-6 text-center tabular-nums" aria-label={`Antal ${name}`}>{n}</span>
      <Button type="button" size="icon" variant="outline" aria-label={`Flere ${name}`} disabled={n >= 10} onClick={() => onChange(n + 1)}><Plus /></Button>
    </div>
  );
}

export function RoomService({ room, busy, onSubmit }: { room: string; busy?: boolean; onSubmit: (details: string) => void }) {
  const [cat, setCat] = useState(CATS[0] ?? '');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [step, setStep] = useState<'menu' | 'cart'>('menu');
  const set = (name: string, n: number) => setCart(c => { const next = { ...c }; if (n <= 0) delete next[name]; else next[name] = Math.min(n, 10); return next; });
  const lines = MENU.filter(i => cart[i.name]);
  const count = lines.reduce((a, i) => a + (cart[i.name] ?? 0), 0);

  if (step === 'cart') {
    return (
      <>
        <p className="text-sm text-muted-foreground">Din kurv · leveres til værelse {room}</p>
        <ul className="divide-y">
          {lines.map(i => <li key={i.name} className="flex items-center justify-between gap-3 py-3"><span className="min-w-0 break-words font-semibold">{i.name}</span><Stepper n={cart[i.name] ?? 0} name={i.name} onChange={n => { set(i.name, n); if (count - (cart[i.name] ?? 0) + n <= 0) setStep('menu'); }} /></li>)}
        </ul>
        <label className="block text-sm">Note til køkkenet (valgfri)<textarea value={note} onChange={e => setNote(e.target.value.slice(0, 200))} rows={2} placeholder="fx uden løg" className="mt-1 w-full rounded-md border bg-card p-2" /></label>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep('menu')}>Tilføj mere</Button>
          <Button className="h-12 flex-1" disabled={busy || count === 0} onClick={() => onSubmit(orderText(cart, note))}>Bekræft bestilling</Button>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Kategorier">
        {CATS.map(c => <Button key={c} type="button" size="sm" variant={cat === c ? 'default' : 'outline'} aria-pressed={cat === c} className="shrink-0 rounded-full" onClick={() => setCat(c)}>{c}</Button>)}
      </div>
      <ul className="divide-y">
        {MENU.filter(i => i.cat === cat).map(i => (
          <li key={i.name} className="flex items-center justify-between gap-3 py-3">
            <span className="min-w-0 break-words font-semibold">{i.name}</span>
            {cart[i.name] ? <Stepper n={cart[i.name] ?? 0} name={i.name} onChange={n => set(i.name, n)} /> : <Button type="button" size="icon" variant="outline" aria-label={`Tilføj ${i.name}`} onClick={() => set(i.name, 1)}><Plus /></Button>}
          </li>
        ))}
      </ul>
      <Button className="sticky bottom-0 h-12 w-full" disabled={count === 0} onClick={() => setStep('cart')}>
        <ShoppingBag />{count === 0 ? 'Vælg noget fra menuen' : `Se kurv · ${count} ${count === 1 ? 'vare' : 'varer'}`}
      </Button>
    </>
  );
}
