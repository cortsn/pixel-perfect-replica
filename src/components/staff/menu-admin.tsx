import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { centsToInput, fmtDKK, parseDKK } from '@/lib/money';
import { card, field, useAct, useStaffData } from '@/components/staff/core';

type Cat = { id: string; name: string; sort: number; active: boolean };
type Item = { id: string; category_id: string; name: string; description: string; price_cents: number; image_url: string | null; active: boolean; sort: number; available_from: string | null; available_to: string | null; variants: { name: string; price_delta_cents: number }[]; addons: { name: string; price_cents: number }[] };
type MenuData = { settings: { enabled: boolean; opens_at: string; closes_at: string } | null; categories: Cat[]; items: Item[] };
type Form = { id: string | null; category_id: string; name: string; description: string; price: string; image_url: string; active: boolean; sort: string; from: string; to: string; variants: { name: string; price: string }[]; addons: { name: string; price: string }[] };

const emptyForm = (category_id: string): Form => ({ id: null, category_id, name: '', description: '', price: '', image_url: '', active: true, sort: '0', from: '', to: '', variants: [], addons: [] });
const toForm = (i: Item): Form => ({ id: i.id, category_id: i.category_id, name: i.name, description: i.description, price: centsToInput(i.price_cents), image_url: i.image_url ?? '', active: i.active, sort: String(i.sort), from: i.available_from ?? '', to: i.available_to ?? '',
  variants: i.variants.map(v => ({ name: v.name, price: centsToInput(v.price_delta_cents) })), addons: i.addons.map(a => ({ name: a.name, price: centsToInput(a.price_cents) })) });

function OptionRows({ label, hint, rows, onChange }: { label: string; hint: string; rows: { name: string; price: string }[]; onChange: (r: { name: string; price: string }[]) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">{label}</legend>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <input aria-label={`${label} navn ${i + 1}`} placeholder="Navn" className={field} value={r.name} onChange={e => onChange(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <input aria-label={`${label} pris ${i + 1}`} placeholder="Pris" inputMode="decimal" className={`${field} w-28`} value={r.price} onChange={e => onChange(rows.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
          <Button type="button" size="icon" variant="ghost" aria-label="Fjern" onClick={() => onChange(rows.filter((_, j) => j !== i))}><X /></Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...rows, { name: '', price: '0' }])}><Plus />Tilføj</Button>
    </fieldset>
  );
}

function ItemEditor({ initial, cats, onClose, onSaved }: { initial: Form; cats: Cat[]; onClose: () => void; onSaved: () => void }) {
  const act = useAct();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const price = parseDKK(f.price);
    if (!f.name.trim()) { toast.error('Skriv et navn.'); return; }
    if (price === null || price < 0) { toast.error('Skriv en gyldig pris, fx 95 eller 95,50.'); return; }
    if ((f.from === '') !== (f.to === '')) { toast.error('Udfyld både fra- og til-tidspunkt, eller ingen af dem.'); return; }
    const variants = f.variants.map(v => ({ name: v.name.trim(), price_delta_cents: parseDKK(v.price) }));
    const addons = f.addons.map(a => ({ name: a.name.trim(), price_cents: parseDKK(a.price) }));
    if ([...variants, ...addons].some(o => !o.name) || variants.some(v => v.price_delta_cents === null) || addons.some(a => a.price_cents === null || a.price_cents < 0)) { toast.error('Alle varianter og tilvalg skal have navn og gyldig pris (tilvalg kan ikke være negative).'); return; }
    setBusy(true);
    const r = await act('staff_menu_item_save', { _item: { id: f.id, category_id: f.category_id, name: f.name, description: f.description, price_cents: price, image_url: f.image_url, active: f.active, sort: Number(f.sort) || 0, available_from: f.from || null, available_to: f.to || null, variants, addons } }, f.id ? 'Varen er gemt' : 'Varen er oprettet');
    setBusy(false);
    if (r.ok) { onSaved(); onClose(); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent aria-describedby="item-desc" className="max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-xl overflow-y-auto rounded-2xl">
        <DialogTitle className="text-2xl">{f.id ? 'Rediger vare' : 'Ny vare'}</DialogTitle>
        <DialogDescription id="item-desc">Gemmes med det samme i gæsteappen.</DialogDescription>
        <form onSubmit={save} className="space-y-4">
          <label className="block text-sm">Navn<input className={`${field} mt-1`} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} maxLength={100} /></label>
          <label className="block text-sm">Beskrivelse<textarea className={`${field} mt-1`} rows={2} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} maxLength={500} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">Pris (kr)<input inputMode="decimal" className={`${field} mt-1`} value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></label>
            <label className="block text-sm">Kategori<select className={`${field} mt-1`} value={f.category_id} onChange={e => setF({ ...f, category_id: e.target.value })}>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          </div>
          <label className="block text-sm">Billede (webadresse)<input type="url" placeholder="https://…" className={`${field} mt-1`} value={f.image_url} onChange={e => setF({ ...f, image_url: e.target.value })} /></label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-sm">Serveres fra<input type="time" className={`${field} mt-1`} value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></label>
            <label className="block text-sm">Serveres til<input type="time" className={`${field} mt-1`} value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></label>
            <label className="block text-sm">Rækkefølge<input inputMode="numeric" className={`${field} mt-1`} value={f.sort} onChange={e => setF({ ...f, sort: e.target.value })} /></label>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">Lad tiderne stå tomme, hvis varen kan bestilles hele roomservice-døgnet.</p>
          <OptionRows label="Varianter" hint="Gæsten vælger præcis én, fx størrelse. Prisen er tillæg til varens pris (0 = inkluderet)." rows={f.variants} onChange={variants => setF({ ...f, variants })} />
          <OptionRows label="Tilvalg" hint="Gæsten kan vælge flere, fx ekstra ost. Prisen lægges oveni." rows={f.addons} onChange={addons => setF({ ...f, addons })} />
          <label className="flex items-center gap-3 text-sm"><Switch checked={f.active} onCheckedChange={active => setF({ ...f, active })} aria-label="Aktiv" />Aktiv (kan bestilles)</label>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Annuller</Button><Button disabled={busy}>Gem</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Hotellets egen menu: kategorier, varer, priser, billeder, varianter, tilvalg, tilgængelighed og åbningstider. */
export function MenuAdmin({ part = 'all' }: { part?: 'menu' | 'hours' | 'all' }) {
  const act = useAct();
  const { data, error, reload } = useStaffData<MenuData>('staff_menu');
  const [editing, setEditing] = useState<Form | null>(null);
  const [newCat, setNewCat] = useState('');
  const [hours, setHours] = useState({ enabled: true, opens: '07:00', closes: '22:00' });
  useEffect(() => { if (data?.settings) setHours({ enabled: data.settings.enabled, opens: data.settings.opens_at.slice(0, 5), closes: data.settings.closes_at.slice(0, 5) }); }, [data?.settings]);
  if (!data) return <p className="py-10 text-center text-sm text-muted-foreground">{error ?? 'Henter menuen…'}</p>;

  const cats = [...data.categories].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  async function saveHours() {
    const r = await act('staff_roomservice_settings_save', { _enabled: hours.enabled, _opens: hours.opens, _closes: hours.closes }, 'Åbningstider gemt');
    if (r.ok) await reload();
  }
  async function addCat(e: React.FormEvent) {
    e.preventDefault();
    if (!newCat.trim()) return;
    const r = await act('staff_menu_category_save', { _id: null, _name: newCat, _sort: cats.length + 1, _active: true }, 'Kategorien er oprettet');
    if (r.ok) { setNewCat(''); await reload(); }
  }
  async function patchCat(c: Cat, p: Partial<Cat>) {
    const n = { ...c, ...p };
    const r = await act('staff_menu_category_save', { _id: c.id, _name: n.name, _sort: n.sort, _active: n.active });
    if (r.ok) await reload();
  }
  async function move(c: Cat, dir: -1 | 1) {
    const i = cats.findIndex(x => x.id === c.id), j = i + dir;
    if (j < 0 || j >= cats.length) return;
    const other = cats[j]!;
    await act('staff_menu_category_save', { _id: c.id, _name: c.name, _sort: j + 1, _active: c.active });
    await act('staff_menu_category_save', { _id: other.id, _name: other.name, _sort: i + 1, _active: other.active });
    await reload();
  }
  async function delCat(c: Cat) {
    const n = data!.items.filter(i => i.category_id === c.id).length;
    if (!window.confirm(`Slet kategorien "${c.name}"${n ? ` og de ${n} varer i den` : ''}? Det kan ikke fortrydes.`)) return;
    const r = await act('staff_menu_category_delete', { _id: c.id }, 'Kategorien er slettet');
    if (r.ok) await reload();
  }
  async function toggleItem(i: Item, active: boolean) {
    const r = await act('staff_menu_item_save', { _item: { ...i, active, available_from: i.available_from || null, available_to: i.available_to || null } });
    if (r.ok) await reload();
  }
  async function delItem(i: Item) {
    if (!window.confirm(`Slet "${i.name}"? Tidligere ordrer og regninger påvirkes ikke.`)) return;
    const r = await act('staff_menu_item_delete', { _id: i.id }, 'Varen er slettet');
    if (r.ok) await reload();
  }

  return (
    <div className="space-y-6">
      {part !== 'menu' && <section className={`${card} flex flex-wrap items-end gap-x-6 gap-y-3`}>
        <div><h2 className="text-xl">Åbningstider</h2><p className="text-xs text-muted-foreground">Uden for åbningstiden kan gæster ikke bestille. Ens tider = døgnet rundt.</p></div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={hours.enabled} onCheckedChange={enabled => setHours({ ...hours, enabled })} aria-label="Roomservice åben" />Roomservice slået til</label>
        <label className="text-sm">Åbner<input type="time" className={`${field} mt-1 block`} value={hours.opens} onChange={e => setHours({ ...hours, opens: e.target.value })} /></label>
        <label className="text-sm">Lukker<input type="time" className={`${field} mt-1 block`} value={hours.closes} onChange={e => setHours({ ...hours, closes: e.target.value })} /></label>
        <Button onClick={saveHours}>Gem åbningstider</Button>
      </section>}

      {part !== 'hours' && cats.map((c, idx) => {
        const items = data.items.filter(i => i.category_id === c.id).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
        return (
          <section key={c.id} className={`${card} ${c.active ? '' : 'opacity-70'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label={`Navn på kategori ${c.name}`} defaultValue={c.name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== c.name) void patchCat(c, { name: v }); }} className="min-w-0 flex-1 border-b border-transparent bg-transparent font-display text-2xl outline-none focus:border-brass" />
              <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={c.active} onCheckedChange={a => patchCat(c, { active: a })} aria-label={`Kategori ${c.name} aktiv`} />Aktiv</label>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Flyt op" disabled={idx === 0} onClick={() => move(c, -1)}><ArrowUp /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Flyt ned" disabled={idx === cats.length - 1} onClick={() => move(c, 1)}><ArrowDown /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Slet kategori ${c.name}`} onClick={() => delCat(c)}><Trash2 /></Button>
            </div>
            <ul className="mt-2 divide-y">
              {items.map(i => (
                <li key={i.id} className={`flex flex-wrap items-center gap-3 py-2.5 ${i.active ? '' : 'opacity-60'}`}>
                  {i.image_url ? <img src={i.image_url} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <span className="h-10 w-10 shrink-0 rounded-md bg-secondary" />}
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{i.name}</span>
                    <span className="text-xs text-muted-foreground">{fmtDKK(i.price_cents)}{i.variants.length ? ` · ${i.variants.length} varianter` : ''}{i.addons.length ? ` · ${i.addons.length} tilvalg` : ''}{i.available_from && i.available_to ? ` · ${i.available_from}–${i.available_to}` : ''}</span></span>
                  <Switch checked={i.active} onCheckedChange={a => toggleItem(i, a)} aria-label={`${i.name} aktiv`} />
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Rediger ${i.name}`} onClick={() => setEditing(toForm(i))}><Pencil /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Slet ${i.name}`} onClick={() => delItem(i)}><Trash2 /></Button>
                </li>
              ))}
              {items.length === 0 && <li className="py-3 text-sm text-muted-foreground">Ingen varer endnu.</li>}
            </ul>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => setEditing(emptyForm(c.id))}><Plus />Ny vare i {c.name}</Button>
          </section>
        );
      })}

      {part !== 'hours' && <form onSubmit={addCat} className={`${card} flex flex-wrap items-center gap-2`}>
        <input aria-label="Ny kategori" placeholder="Ny kategori, fx Dessert" className={`${field} max-w-xs`} value={newCat} onChange={e => setNewCat(e.target.value)} maxLength={60} />
        <Button variant="outline"><Plus />Opret kategori</Button>
      </form>}
      {editing && <ItemEditor initial={editing} cats={cats} onClose={() => setEditing(null)} onSaved={() => void reload()} />}
    </div>
  );
}
