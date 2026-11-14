import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { errorText } from '@/lib/hotel';
import { rpc } from '@/lib/cleaning';
import { StayControlsView, type StayRow } from '@/components/hotel/stay';

export function StaffStays({ pin }: { pin: string }) {
  const [stays, setStays] = useState<StayRow[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data } = await rpc<StayRow[]>('staff_stays', { _pin: pin });
    if (data) setStays(data);
  }, [pin]);
  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); setNow(Date.now()); }, 8000);
    return () => clearInterval(t);
  }, [load]);
  async function change(s: StayRow, starts: Date, ends: Date) {
    setBusy(s.id);
    const { error } = await rpc('staff_set_stay', { _pin: pin, _booking: s.id, _starts: starts.toISOString(), _ends: ends.toISOString() });
    setBusy(null);
    if (error) { toast.error(errorText(error)); return; }
    toast.success(`Værelse ${s.room_number}: tiden er ændret. Gæsten får besked.`);
    await load();
  }
  return <StayControlsView stays={stays} now={now} busy={busy} onChange={change} />;
}
