import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { PageTitle, ROLE_LABELS, card, field, useAct, useStaff, useStaffData, type Me } from '@/components/staff/core';

type Member = { id: string; name: string; role: Me['role']; active: boolean };
type Form = { id: string | null; name: string; role: Me['role']; pin: string; active: boolean };

function MemberDialog({ initial, onClose, onSaved }: { initial: Form; onClose: () => void; onSaved: () => void }) {
  const act = useAct();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) { toast.error('Skriv et navn.'); return; }
    if (!f.id && !/^\d{4,8}$/.test(f.pin)) { toast.error('Koden skal være 4–8 cifre.'); return; }
    if (f.id && f.pin && !/^\d{4,8}$/.test(f.pin)) { toast.error('Koden skal være 4–8 cifre.'); return; }
    setBusy(true);
    const r = await act('staff_member_save', { _id: f.id, _name: f.name, _role: f.role, _new_pin: f.pin, _active: f.active }, f.id ? 'Medarbejderen er gemt' : 'Medarbejderen er oprettet');
    setBusy(false);
    if (r.ok) { onSaved(); onClose(); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent aria-describedby="member-desc" className="w-[calc(100%-1.5rem)] max-w-md rounded-2xl">
        <DialogTitle className="text-2xl">{f.id ? 'Rediger medarbejder' : 'Ny medarbejder'}</DialogTitle>
        <DialogDescription id="member-desc">Medarbejderen logger ind med sin egen kode.</DialogDescription>
        <form onSubmit={save} className="space-y-4">
          <label className="block text-sm">Navn<input className={`${field} mt-1`} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} maxLength={80} /></label>
          <label className="block text-sm">Rolle<select className={`${field} mt-1`} value={f.role} onChange={e => setF({ ...f, role: e.target.value as Me['role'] })}>{(Object.keys(ROLE_LABELS) as Me['role'][]).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></label>
          <label className="block text-sm">{f.id ? 'Ny kode (lad stå tom for at beholde)' : 'Kode (4–8 cifre)'}<input type="password" inputMode="numeric" autoComplete="new-password" className={`${field} mt-1`} value={f.pin} onChange={e => setF({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 8) })} /></label>
          <label className="flex items-center gap-3 text-sm"><Switch checked={f.active} onCheckedChange={active => setF({ ...f, active })} aria-label="Aktiv" />Aktiv (kan logge ind)</label>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Annuller</Button><Button disabled={busy}>Gem</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Medarbejdere: hver har sin egen kode og rolle. Kun ledere kan oprette og ændre. */
export function MembersPage() {
  const { me } = useStaff();
  const act = useAct();
  const { data, error, reload } = useStaffData<Member[]>('staff_members_list');
  const [editing, setEditing] = useState<Form | null>(null);
  const manager = me?.role === 'manager';
  async function remove(m: Member) {
    if (!window.confirm(`Slet ${m.name}? Vedkommende kan ikke længere logge ind.`)) return;
    const r = await act('staff_member_delete', { _id: m.id }, 'Medarbejderen er slettet');
    if (r.ok) await reload();
  }
  async function toggle(m: Member, active: boolean) {
    const r = await act('staff_member_save', { _id: m.id, _name: m.name, _role: m.role, _new_pin: '', _active: active });
    if (r.ok) await reload();
  }
  return (
    <>
      <PageTitle title="Medarbejdere" hint="Hovedkoden giver lederadgang. Medarbejdere får hver deres kode." actions={manager ? <Button onClick={() => setEditing({ id: null, name: '', role: 'reception', pin: '', active: true })}><Plus />Ny medarbejder</Button> : undefined} />
      {!manager && <p className="mb-4 rounded-lg bg-secondary p-3 text-sm">Kun ledere kan oprette og ændre medarbejdere.</p>}
      <div className={`${card} p-0`}>
        <ul className="divide-y">
          {(data ?? []).map(m => (
            <li key={m.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${m.active ? '' : 'opacity-60'}`}>
              <span className="min-w-0 flex-1"><span className="block font-semibold">{m.name}</span><span className="text-xs text-muted-foreground">{ROLE_LABELS[m.role]}{m.active ? '' : ' · deaktiveret'}</span></span>
              {manager && <>
                <Switch checked={m.active} onCheckedChange={a => toggle(m, a)} aria-label={`${m.name} aktiv`} />
                <Button size="icon" variant="ghost" aria-label={`Rediger ${m.name}`} onClick={() => setEditing({ id: m.id, name: m.name, role: m.role, pin: '', active: m.active })}><Pencil /></Button>
                <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Slet ${m.name}`} onClick={() => remove(m)}><Trash2 /></Button>
              </>}
            </li>
          ))}
          {data && data.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted-foreground">Ingen medarbejdere endnu. Alle logger ind med hovedkoden.</li>}
          {!data && <li className="px-4 py-10 text-center text-sm text-muted-foreground">{error ?? 'Henter…'}</li>}
        </ul>
      </div>
      {editing && <MemberDialog initial={editing} onClose={() => setEditing(null)} onSaved={() => void reload()} />}
    </>
  );
}
