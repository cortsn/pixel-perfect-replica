import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

const ITEM = 40;
const PAD = ITEM * 2;

/** Én hjul-kolonne som i et ur: rul op og ned, og det midterste tal er valgt. */
function Wheel({ items, index, onIndex, label, className = '' }: { items: string[]; index: number; onIndex: (i: number) => void; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { const el = ref.current; if (el && Math.abs(el.scrollTop - index * ITEM) > 2) el.scrollTop = index * ITEM; }, [index]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const settle = () => {
    const el = ref.current;
    if (!el) return;
    const i = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM)));
    if (i !== index) onIndex(i);
  };
  return (
    <div className={`relative ${className}`}>
      <div ref={ref} role="listbox" aria-label={label} tabIndex={0}
        onScroll={() => { clearTimeout(timer.current); timer.current = setTimeout(settle, 90); }}
        onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); onIndex(Math.min(items.length - 1, index + 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); onIndex(Math.max(0, index - 1)); } }}
        className="h-[200px] snap-y snap-mandatory overflow-y-auto outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-scrollbar]:hidden">
        <div style={{ height: PAD }} />
        {items.map((t, i) => (
          <div key={`${t}-${i}`} role="option" aria-selected={i === index} onClick={() => { onIndex(i); ref.current?.scrollTo({ top: i * ITEM, behavior: 'smooth' }); }}
            className={`flex h-10 cursor-pointer snap-center items-center justify-center tabular-nums transition ${i === index ? 'text-xl font-semibold' : 'text-base text-muted-foreground'}`}>{t}</div>
        ))}
        <div style={{ height: PAD }} />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-20 h-10 rounded-lg border-y bg-primary/10" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-background to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const pad = (n: number) => String(n).padStart(2, '0');

/** Vælg dag og klokkeslæt med rullehjul (som når man bestiller tid i en parkeringsapp). */
export function TimeWheelDialog({ title, description, value, validate, onSave, onClose }: {
  title: string; description?: string; value: Date; validate?: (d: Date) => string | null; onSave: (d: Date) => void; onClose: () => void;
}) {
  const days = useMemo(() => {
    const base = startOfDay(value), today = startOfDay(new Date()).getTime();
    return Array.from({ length: 40 }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i - 7);
      const label = d.getTime() === today ? 'I dag' : d.toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' });
      return { d, label };
    });
  }, [value]);
  const minutes = useMemo(() => [...new Set([...Array.from({ length: 12 }, (_, i) => i * 5), value.getMinutes()])].sort((a, b) => a - b), [value]);
  const [dayIdx, setDayIdx] = useState(7);
  const [hour, setHour] = useState(value.getHours());
  const [minIdx, setMinIdx] = useState(() => minutes.indexOf(value.getMinutes()));
  const picked = new Date(days[dayIdx]!.d.getFullYear(), days[dayIdx]!.d.getMonth(), days[dayIdx]!.d.getDate(), hour, minutes[minIdx]!);
  const problem = validate?.(picked) ?? null;
  const changed = picked.getTime() !== value.getTime();
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent aria-describedby="wheel-desc" className="w-[calc(100%-1.5rem)] max-w-sm rounded-2xl">
        <DialogTitle className="text-center text-xl">{title}</DialogTitle>
        <DialogDescription id="wheel-desc" className="text-center">{description ?? 'Rul for at vælge dag og tid.'}</DialogDescription>
        <div className="grid grid-cols-[1.6fr_1fr_auto_1fr] items-center gap-1" role="group" aria-label="Vælg tid">
          <Wheel items={days.map(x => x.label)} index={dayIdx} onIndex={setDayIdx} label="Dag" />
          <Wheel items={Array.from({ length: 24 }, (_, i) => pad(i))} index={hour} onIndex={setHour} label="Time" />
          <span className="pb-1 text-xl font-semibold" aria-hidden>:</span>
          <Wheel items={minutes.map(pad)} index={minIdx} onIndex={setMinIdx} label="Minut" />
        </div>
        <p className="text-center text-sm font-medium" role="status">{picked.toLocaleString('da-DK', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
        {problem && <p role="alert" className="text-center text-sm text-destructive">{problem}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuller</Button>
          <Button disabled={!changed || !!problem} onClick={() => onSave(picked)}>Gem tid</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
