import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmtDKK } from '@/lib/money';
import { PageTitle, card, dayTime, field, useStaff, useStaffData } from '@/components/staff/core';

export type GuestRow = { id: string; reference: string; room_number: string; guest_name: string; guest_email: string | null; guests: number; starts_at: string; ends_at: string; checked_in_at: string | null; balance_cents: number; in_house: boolean };
type Filter = 'all' | 'in' | 'arriving';

/** Gæster der bor på hotellet eller er på vej, med saldo og genvej til regning/checkout. */
export function GuestsPage() {
  const { openBill } = useStaff();
  const { data, error, reload } = useStaffData<GuestRow[]>('staff_guests', {}, 8000);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const rows = useMemo(() => (data ?? []).filter(g => (filter === 'all' || (filter === 'in' ? g.in_house : !g.in_house)) && `${g.guest_name} ${g.room_number} ${g.reference}`.toLowerCase().includes(q.trim().toLowerCase())), [data, q, filter]);
  const counts = { in: (data ?? []).filter(g => g.in_house).length, arriving: (data ?? []).filter(g => !g.in_house).length };
  return (
    <>
      <PageTitle title="Gæster" hint={`${counts.in} bor på hotellet · ${counts.arriving} på vej`} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative block min-w-56 flex-1 sm:max-w-sm"><span className="sr-only">Søg gæst</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Søg navn, værelse eller booking" className={`${field} pl-9`} /></label>
        {([['all', 'Alle'], ['in', 'Boende'], ['arriving', 'Ankommer']] as const).map(([f, l]) => <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} aria-pressed={filter === f} onClick={() => setFilter(f)}>{l}</Button>)}
      </div>
      <div className={`${card} overflow-x-auto p-0`}>
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b text-muted-foreground"><tr>{['Værelse', 'Gæst', 'Ophold', 'Status', 'Saldo', ''].map(h => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody className="divide-y">
            {rows.map(g => (
              <tr key={g.id}>
                <td className="px-4 py-3 font-display text-2xl">{g.room_number}</td>
                <td className="px-4 py-3"><span className="font-semibold">{g.guest_name}</span><span className="block text-xs text-muted-foreground">{g.reference} · {g.guests} {g.guests === 1 ? 'gæst' : 'gæster'}</span></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{dayTime(g.starts_at)}<br />{dayTime(g.ends_at)}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${g.in_house ? 'bg-status-clean/15 text-status-clean' : 'bg-secondary'}`}>{g.in_house ? (g.checked_in_at ? 'Tjekket ind' : 'Ikke tjekket ind') : 'Ankommer'}</span></td>
                <td className="px-4 py-3 tabular-nums">{fmtDKK(g.balance_cents)}</td>
                <td className="px-4 py-3 text-right"><Button size="sm" variant={g.in_house ? 'default' : 'outline'} onClick={() => openBill(g.id)}>{g.in_house ? 'Regning / tjek ud' : 'Regning'}</Button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">{error ?? (data ? 'Ingen gæster matcher' : 'Henter…')}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground"><button type="button" className="underline" onClick={() => void reload()}>Opdater</button> · Afrejste gæster finder du under Salg → Historik.</p>
    </>
  );
}
