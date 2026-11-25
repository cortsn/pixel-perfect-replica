import { useState } from 'react';
import { Megaphone, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageTitle, card, dayTime, useAct, useStaffData } from '@/components/staff/core';

type Announcement = { id: string; message: string; created_by: string; created_at: string; removed_at: string | null; expires_at: string | null };
/** Hvornår beskeden fjernes fra gæsternes app. */
const EXPIRY: [string, string, number | null][] = [['6h', 'Efter 6 timer', 6], ['24h', 'Efter 24 timer', 24], ['3d', 'Efter 3 dage', 72], ['7d', 'Efter 7 dage', 168], ['stay', 'Når opholdet slutter', null]];
const MAX = 500;
const IDEAS = ['50 % på alle drinks i baren i aften kl. 17–19.', 'Morgenmaden serveres i dag til kl. 11.', 'Poolen er lukket for rengøring frem til kl. 14.'];

/** Beskeder til gæster: skriv en besked, og den dukker op som en notifikation i appen hos alle gæster, der bor på hotellet. */
export function AnnouncementsPage() {
  const act = useAct();
  const { data, error, reload } = useStaffData<Announcement[]>('staff_announcements', {}, 15000);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [expiry, setExpiry] = useState('24h');
  const [custom, setCustom] = useState('');
  const expiresAt = () => (expiry === 'custom' ? (custom ? new Date(custom).toISOString() : null) : (h => (h === null ? null : new Date(Date.now() + h * 3600e3).toISOString()))(EXPIRY.find(e => e[0] === expiry)?.[2] ?? null));
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    if (expiry === 'custom' && (!custom || new Date(custom).getTime() <= Date.now())) { toast.error('Vælg et tidspunkt i fremtiden.'); setSending(false); return; }
    const r = await act('staff_post_announcement', { _message: text.trim(), _expires_at: expiresAt() }, 'Beskeden er sendt til gæsterne');
    setSending(false);
    if (r.ok) { setText(''); await reload(); }
  }
  async function remove(a: Announcement) {
    const r = await act('staff_remove_announcement', { _id: a.id }, 'Beskeden er fjernet fra gæsternes app');
    if (r.ok) await reload();
  }
  return (
    <>
      <PageTitle title="Beskeder til gæster" hint="Skriv en besked, og den vises som en notifikation i gæsternes app, fx et tilbud i baren." />
      <form onSubmit={send} className={`${card} max-w-2xl space-y-3`}>
        <label className="block text-sm font-medium">Besked
          <textarea value={text} onChange={e => setText(e.target.value.slice(0, MAX))} rows={3} placeholder="fx 50 % på alle drinks i baren i aften" className="mt-1 w-full rounded-md border bg-background p-3 text-base" />
        </label>
        <div className="flex flex-wrap gap-1.5">{IDEAS.map(i => <button key={i} type="button" onClick={() => setText(i)} className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-accent">{i}</button>)}</div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">Fjernes fra gæsternes app
            <select aria-label="Hvornår beskeden fjernes" value={expiry} onChange={e => setExpiry(e.target.value)} className="rounded-md border bg-background px-2 py-1.5">
              {EXPIRY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}<option value="custom">Vælg tidspunkt…</option>
            </select></label>
          {expiry === 'custom' && <input type="datetime-local" aria-label="Fjernes d." value={custom} onChange={e => setCustom(e.target.value)} className="rounded-md border bg-background px-2 py-1.5" />}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{text.length}/{MAX} · vises hos alle gæster med appen</span>
          <Button disabled={!text.trim() || sending}><Send />Send til alle gæster</Button>
        </div>
      </form>
      <h2 className="mb-2 mt-8 flex items-center gap-2 text-xl"><Megaphone className="h-5 w-5 text-brass" />Sendte beskeder</h2>
      <ul className="max-w-2xl space-y-2">
        {(data ?? []).map(a => (
          <li key={a.id} className={`${card} flex items-start justify-between gap-3 py-3 ${a.removed_at || (a.expires_at && Date.parse(a.expires_at) <= Date.now()) ? 'opacity-50' : ''}`}>
            <div className="min-w-0"><p className="break-words">{a.message}</p><p className="mt-1 text-xs text-muted-foreground">{dayTime(a.created_at)}{a.created_by ? ` · ${a.created_by}` : ''}{a.removed_at ? ' · fjernet' : a.expires_at ? (Date.parse(a.expires_at) <= Date.now() ? ' · udløbet' : ` · fjernes ${dayTime(a.expires_at)}`) : ' · bliver, mens opholdet varer'}</p></div>
            {!a.removed_at && <Button size="icon" variant="ghost" aria-label="Fjern besked" onClick={() => remove(a)}><Trash2 /></Button>}
          </li>
        ))}
        {data && data.length === 0 && <li className="py-6 text-sm text-muted-foreground">Ingen beskeder sendt endnu.</li>}
        {!data && <li className="py-6 text-sm text-muted-foreground">{error ?? 'Henter…'}</li>}
      </ul>
      <p className="mt-4 max-w-2xl text-xs text-muted-foreground">Gæsterne får en lille boble i appen og kan altid finde beskeden under Beskeder fra hotellet, indtil den fjernes. Den sendes ikke som SMS eller push uden for appen.</p>
    </>
  );
}
