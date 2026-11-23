import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageTitle, ROLE_LABELS, card, field, useAct, useStaff, useStaffData } from '@/components/staff/core';
import { MembersPage } from '@/components/staff/members';
import { centsToInput, fmtDKK, parseDKK } from '@/lib/money';
import type { Room } from '@/components/staff/rooms';

type Settings = { wifi_ssid: string | null; wifi_password: string | null; roomservice: { enabled: boolean; opens_at: string; closes_at: string } | null };

/** Indstillinger: din konto, hovedkode, Wi-Fi til gæsterne og genvej til roomservice-åbningstider. */
function GeneralSettings({ onLogout }: { onLogout: () => void }) {
  const { me, go } = useStaff();
  const act = useAct();
  const { data, reload } = useStaffData<Settings>('staff_settings');
  const manager = me?.role === 'manager';
  const [wifi, setWifi] = useState({ ssid: '', password: '' });
  const [pin, setPin] = useState('');
  useEffect(() => { if (data) setWifi({ ssid: data.wifi_ssid ?? '', password: data.wifi_password ?? '' }); }, [data]);
  async function saveWifi(e: React.FormEvent) {
    e.preventDefault();
    const r = await act('staff_set_wifi', { _ssid: wifi.ssid, _password: wifi.password }, 'Wi-Fi er opdateret. Gæsterne ser det næste gang appen opdaterer.');
    if (r.ok) await reload();
  }
  async function savePin(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(pin)) { toast.error('Koden skal være 4–8 cifre.'); return; }
    const r = await act('staff_set_master_pin', { _new: pin }, 'Hovedkoden er ændret. Log ind igen med den nye kode.');
    if (r.ok) { setPin(''); onLogout(); }
  }
  return (
    <>
      <PageTitle title="Indstillinger" />
      <div className="grid max-w-3xl gap-6">
        <section className={card}>
          <h2 className="text-xl">Din konto</h2>
          <p className="mt-2 text-sm">{me ? <><b>{me.name}</b> · {ROLE_LABELS[me.role]}</> : 'Henter…'}</p>
          <Button variant="outline" className="mt-3" onClick={onLogout}>Log ud</Button>
        </section>
        <section className={card}>
          <h2 className="text-xl">Roomservice</h2>
          <p className="mt-1 text-sm text-muted-foreground">{data?.roomservice ? `${data.roomservice.enabled ? 'Åben' : 'Slået fra'} · ${data.roomservice.opens_at.slice(0, 5)}–${data.roomservice.closes_at.slice(0, 5)}` : 'Henter…'}</p>
          <Button variant="outline" className="mt-3" onClick={() => go('services', 'hours')}>Ret åbningstider</Button>
        </section>
        <form onSubmit={saveWifi} className={`${card} space-y-3`}>
          <h2 className="text-xl">Wi-Fi til gæster</h2>
          <label className="block text-sm">Netværksnavn<input className={`${field} mt-1`} value={wifi.ssid} onChange={e => setWifi({ ...wifi, ssid: e.target.value })} disabled={!manager} /></label>
          <label className="block text-sm">Adgangskode (mindst 8 tegn)<input className={`${field} mt-1`} value={wifi.password} onChange={e => setWifi({ ...wifi, password: e.target.value })} disabled={!manager} /></label>
          <Button disabled={!manager}>Gem Wi-Fi</Button>
          {!manager && <p className="text-xs text-muted-foreground">Kun ledere kan ændre Wi-Fi.</p>}
        </form>
        <form onSubmit={savePin} className={`${card} space-y-3`}>
          <h2 className="text-xl">Hovedkode</h2>
          <p className="text-sm text-muted-foreground">Hovedkoden giver lederadgang. Skift den fra standardkoden, og del den kun med ledere.</p>
          <label className="block text-sm">Ny hovedkode (4–8 cifre)<input type="password" inputMode="numeric" autoComplete="new-password" className={`${field} mt-1 max-w-48`} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} disabled={!manager} /></label>
          <Button disabled={!manager || pin.length < 4}>Skift hovedkode</Button>
        </form>
      </div>
    </>
  );
}

function PriceRow({ r, onSaved }: { r: Pick<Room, 'number' | 'floor' | 'capacity' | 'rate_cents'>; onSaved: () => void }) {
  const act = useAct();
  const [v, setV] = useState(centsToInput(r.rate_cents));
  const dirty = parseDKK(v) !== r.rate_cents;
  async function save() {
    const cents = parseDKK(v);
    if (cents === null || cents < 0) { toast.error('Skriv en gyldig pris pr. nat.'); return; }
    const res = await act('staff_room_rate_set', { _room: r.number, _cents: cents }, `Værelse ${r.number}: prisen er gemt`);
    if (res.ok) onSaved();
  }
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2.5">
      <span className="w-16 font-display text-2xl leading-none">{r.number}</span>
      <span className="w-24 text-xs text-muted-foreground">{r.floor}. sal · {r.capacity} pers.</span>
      <input aria-label={`Pris for værelse ${r.number}`} inputMode="decimal" className={`${field} w-32`} value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && dirty) void save(); }} />
      <span className="text-xs text-muted-foreground">kr. pr. nat</span>
      <Button size="sm" variant={dirty ? 'default' : 'outline'} disabled={!dirty} onClick={save}>Gem</Button>
      {r.rate_cents === 0 && <span className="text-xs text-destructive">Mangler pris: overnatning kan ikke lægges på en regning</span>}
    </li>
  );
}

/** Værelsespriser pr. nat. Bruges, når overnatning lægges på en gæsteregning. */
function RoomPrices() {
  const { data, error, reload } = useStaffData<Room[]>('staff_rooms');
  return (
    <>
      <PageTitle title="Værelsespriser" hint="Pris pr. nat for hvert værelse. Bruges til overnatning på gæsteregningen." />
      <div className={`${card} p-0`}>
        <ul className="divide-y">
          {(data ?? []).map(r => <PriceRow key={`${r.number}-${r.rate_cents}`} r={r} onSaved={() => void reload()} />)}
          {!data && <li className="px-4 py-10 text-center text-sm text-muted-foreground">{error ?? 'Henter…'}</li>}
        </ul>
      </div>
      {data && data.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Gennemsnit: {fmtDKK(Math.round(data.reduce((a, r) => a + r.rate_cents, 0) / data.length))} pr. nat</p>}
    </>
  );
}

/** Indstillinger: generelt, medarbejdere og værelsespriser. */
export function SettingsSection({ page, onLogout }: { page: string; onLogout: () => void }) {
  if (page === 'staff') return <MembersPage />;
  if (page === 'prices') return <RoomPrices />;
  return <GeneralSettings onLogout={onLogout} />;
}
