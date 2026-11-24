import { useMemo, useState } from 'react';
import { Check, Clock, Play, Repeat, ShowerHead, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmtLeft, isOpen, timeLeft, type CleaningRequest } from '@/lib/cleaning';
import { PageTitle, card, hm, useAct, useStaffData } from '@/components/staff/core';

type TowelOrder = { id: string; room_number: string; type: string; status: string; quantity: number; created_at: string; guest_name: string | null };
const OPEN_ORDER = ['pending', 'accepted', 'in_progress', 'ready'];
type Filter = 'all' | 'clean' | 'towels';
type Task =
  | { key: string; kind: 'clean'; room: string; guest: string; at: number; req: CleaningRequest }
  | { key: string; kind: 'towels'; room: string; guest: string; at: number; order: TowelOrder };

/** Hvor hastende en opgave er: bestilt igen først, derefter kortest tid tilbage af gæstens fravær, ellers ældste først. */
function urgency(t: Task, now: number) {
  if (t.kind === 'towels') return t.at;
  const left = timeLeft(t.req, now);
  const base = left === null ? 4e15 : left <= 0 ? 3e15 : left * 1e3;
  return (t.req.is_repeat ? -1e16 : 0) + base + t.at / 1e9;
}

/**
 * Opgaver: rengøring og håndklæder samlet. Kun værelser med aktive opgaver vises. Hver opgave har Start og Færdig,
 * og når den sidste opgave på et værelse er færdig, forsvinder værelset af sig selv.
 */
export function TasksSection() {
  const act = useAct();
  const cleaning = useStaffData<{ requests: CleaningRequest[] }>('staff_cleaning', {}, 6000);
  const orders = useStaffData<TowelOrder[]>('staff_orders', { _limit: 150 }, 6000);
  const [filter, setFilter] = useState<Filter>('all');
  const [gone, setGone] = useState<Set<string>>(new Set()); // behandlet, men serveren har ikke svaret endnu
  const [started, setStarted] = useState<Set<string>>(new Set());
  const now = Date.now();

  const tasks = useMemo<Task[]>(() => {
    const c = (cleaning.data?.requests ?? []).filter(r => isOpen(r.status)).map<Task>(r => ({ key: `c-${r.id}`, kind: 'clean', room: r.room_number, guest: r.guest_name ?? 'Gæst', at: Date.parse(r.created_at), req: r }));
    const t = (orders.data ?? []).filter(o => o.type === 'towels' && OPEN_ORDER.includes(o.status)).map<Task>(o => ({ key: `t-${o.id}`, kind: 'towels', room: o.room_number, guest: o.guest_name ?? 'Gæst', at: Date.parse(o.created_at), order: o }));
    return [...c, ...t].filter(x => !gone.has(x.key));
  }, [cleaning.data, orders.data, gone]);

  const counts = { all: tasks.length, clean: tasks.filter(t => t.kind === 'clean').length, towels: tasks.filter(t => t.kind === 'towels').length };
  const rooms = useMemo(() => {
    const m = new Map<string, Task[]>();
    tasks.filter(t => filter === 'all' || t.kind === filter).forEach(t => m.set(t.room, [...(m.get(t.room) ?? []), t]));
    return [...m.entries()]
      .map(([room, ts]) => ({ room, tasks: [...ts].sort((a, b) => urgency(a, now) - urgency(b, now)), guest: ts[0]!.guest, all: tasks.filter(t => t.room === room) }))
      .sort((a, b) => urgency(a.tasks[0]!, now) - urgency(b.tasks[0]!, now));
  }, [tasks, filter, now]);

  const isStarted = (t: Task) => started.has(t.key) || (t.kind === 'clean' ? t.req.status === 'in_progress' : t.order.status === 'in_progress' || t.order.status === 'ready');
  const hide = (key: string, on: boolean) => setGone(s => { const n = new Set(s); if (on) n.add(key); else n.delete(key); return n; });
  async function run(t: Task, status: 'in_progress' | 'done' | 'not_reached') {
    if (status === 'in_progress') setStarted(s => new Set(s).add(t.key)); else hide(t.key, true);
    const res = t.kind === 'clean'
      ? await act('staff_set_cleaning', { _request: t.req.id, _status: status }, status === 'done' ? `Værelse ${t.room}: rengøring er færdig` : undefined)
      : await act('staff_set_order_status', { _order: t.order.id, _status: status }, status === 'done' ? `Værelse ${t.room}: håndklæder er leveret` : undefined);
    if (!res.ok) { hide(t.key, false); setStarted(s => { const n = new Set(s); n.delete(t.key); return n; }); return; }
    await Promise.all([cleaning.reload(), orders.reload()]);
    hide(t.key, false);
  }
  /** Bytter personalet poolhåndklæder under rengøringen, tæller det som gæstens bestilling (12-timers reglen). */
  async function poolTowels(room: string) {
    const res = await act('staff_pool_towels', { _room: room }, `Værelse ${room}: poolhåndklæder er byttet`);
    if (res.ok) await Promise.all([cleaning.reload(), orders.reload()]);
  }

  return (
    <>
      <PageTitle title="Opgaver" hint="Rengøring og håndklæder samlet. Værelset forsvinder, når alle opgaver er færdige." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border p-0.5" role="tablist" aria-label="Vis opgaver">
          {([['all', 'Alle'], ['clean', 'Rengøring'], ['towels', 'Håndklæder']] as const).map(([f, l]) => (
            <Button key={f} size="sm" role="tab" aria-selected={filter === f} variant={filter === f ? 'default' : 'ghost'} onClick={() => setFilter(f)}>{l} ({counts[f]})</Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{rooms.length} {rooms.length === 1 ? 'værelse' : 'værelser'} · det mest hastende øverst</p>
      </div>
      <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3" aria-live="polite">
        {rooms.map(r => (
          <li key={r.room} className={`${card} p-3`}>
            <div className="flex items-baseline justify-between gap-2"><span className="font-display text-3xl leading-none">{r.room}</span><span className="truncate text-sm text-muted-foreground">{r.guest}</span></div>
            <ul className="mt-2 divide-y">
              {r.tasks.map(t => {
                const left = t.kind === 'clean' ? timeLeft(t.req, now) : null;
                const go = isStarted(t);
                return (
                  <li key={t.key} className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      {t.kind === 'clean' ? (
                        <>
                          <p className="flex items-center gap-1.5 font-semibold"><Sparkles className="h-4 w-4 shrink-0 text-brass" />{t.req.kind === 'checkout' ? 'Afrejse-rengøring' : 'Rengøring'}
                            {t.req.is_repeat && <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[11px] font-semibold text-destructive"><Repeat className="h-3 w-3" />bestilt igen</span>}</p>
                          <p className="text-xs text-muted-foreground">
                            {t.req.kind === 'checkout' ? 'Skift alle håndklæder' : (t.req.towel_count ?? 0) > 0 ? 'Skift værelseshåndklæder' : 'Ingen håndklædeskift'}
                            {' · '}{t.req.away_from && t.req.away_until ? <span className={left !== null && left > 0 && left < 45 * 60000 ? 'font-semibold text-destructive' : ''}><Clock className="mr-0.5 inline h-3 w-3" />væk {hm(t.req.away_from)}–{hm(t.req.away_until)} ({left !== null && left > 0 ? `${fmtLeft(left)} tilbage` : 'udløbet'})</span> : 'når som helst'}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="flex items-center gap-1.5 font-semibold"><ShowerHead className="h-4 w-4 shrink-0 text-primary" />Byt {t.order.quantity} {t.order.quantity === 1 ? 'poolhåndklæde' : 'poolhåndklæder'}</p>
                          <p className="text-xs text-muted-foreground">Bestilt {hm(t.order.created_at)}</p>
                        </>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      {!go && <Button size="sm" variant="outline" className="h-9 flex-1" onClick={() => run(t, 'in_progress')}><Play />Start</Button>}
                      <Button size="sm" className="h-9 flex-1" variant={go ? 'default' : 'outline'} onClick={() => run(t, 'done')}><Check />Færdig</Button>
                      {t.kind === 'clean' && t.req.kind !== 'checkout' && <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" aria-label="Ikke nået" title="Ikke nået" onClick={() => run(t, 'not_reached')}><X /></Button>}
                    </div>
                  </li>
                );
              })}
            </ul>
            {filter !== 'towels' && r.all.some(t => t.kind === 'clean' && t.req.kind !== 'checkout') && !r.all.some(t => t.kind === 'towels') && (
              <Button size="sm" variant="ghost" className="mt-1 h-8 text-xs" onClick={() => poolTowels(r.room)}><ShowerHead />Byttede også poolhåndklæder</Button>
            )}
          </li>
        ))}
        {rooms.length === 0 && <li className={`${card} col-span-full py-12 text-center text-sm text-muted-foreground`}>{cleaning.data && orders.data ? 'Ingen aktive opgaver lige nu' : (cleaning.error ?? orders.error ?? 'Henter…')}</li>}
      </ul>
    </>
  );
}
