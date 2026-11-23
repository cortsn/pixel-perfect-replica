import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageTitle, ROLE_LABELS, card, field, useAct, useStaff, useStaffData } from '@/components/staff/core';

type Settings = { wifi_ssid: string | null; wifi_password: string | null; roomservice: { enabled: boolean; opens_at: string; closes_at: string } | null };

/** Indstillinger: din konto, hovedkode, Wi-Fi til gæsterne og genvej til roomservice-åbningstider. */
export function SettingsPage({ onLogout }: { onLogout: () => void }) {
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
          <Button variant="outline" className="mt-3" onClick={() => go('roomservice')}>Ret menu og åbningstider</Button>
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
