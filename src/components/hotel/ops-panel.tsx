import { useCallback, useEffect, useState } from 'react';
import { Leaf, ShoppingBasket, Star, Utensils } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { dinnerStats, purchaseSuggestions } from '@/lib/ops';

type Booking = { guests: number; dinner_choice: string | null; starts_at: string; ends_at: string; active: boolean };
type Feedback = { id: string; room_number: string; rating: number; comment: string; created_at: string };
type OrderLite = { type: string; details: string; quantity?: number; cancelled?: boolean };

export function OpsPanel({ pin, orders }: { pin: string; orders: OrderLite[] }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('staff_pms', { _pin: pin });
    const d = data as unknown as { bookings?: Booking[]; feedback?: Feedback[] } | null;
    setBookings(d?.bookings ?? []);
    setFeedback(d?.feedback ?? []);
  }, [pin]);
  useEffect(() => {
    void load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const now = Date.now();
  const staying = bookings.filter(b => b.active && Date.parse(b.starts_at) <= now && now < Date.parse(b.ends_at));
  const d = dinnerStats(staying);
  const buy = purchaseSuggestions(orders).slice(0, 5);
  const avg = feedback.length ? Math.round((feedback.reduce((a, f) => a + f.rating, 0) / feedback.length) * 10) / 10 : null;

  return (
    <section className="grid gap-4 border-b px-6 py-6 md:grid-cols-3 lg:px-8">
      <article className="rounded-lg border bg-card p-4">
        <p className="flex items-center gap-2 text-sm font-semibold"><Leaf className="h-4 w-4 text-primary" />Mindske madspild</p>
        <p className="mt-3 flex items-baseline gap-2 font-display text-5xl leading-none">{d.eating}<span className="text-2xl text-muted-foreground">/ {d.total}</span></p>
        <p className="mt-1 text-sm text-muted-foreground">gæster spiser på hotellet i aften</p>
        <progress aria-label="Andel der spiser på hotellet" value={d.pct} max={100} className="hotel-progress mt-3 h-2 w-full" />
        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Utensils className="h-3 w-3" />Forventet mad: ca. {d.kg} kg · {d.unanswered} har ikke svaret</p>
      </article>
      <article className="rounded-lg border bg-card p-4">
        <p className="flex items-center gap-2 text-sm font-semibold"><ShoppingBasket className="h-4 w-4 text-primary" />Indkøbsforslag (7 dage)</p>
        <ul className="mt-3 space-y-1 text-sm">
          {buy.map(b => <li key={b.item} className="flex justify-between gap-3"><span className="min-w-0 break-words">{b.item}</span><span className="shrink-0 text-muted-foreground">køb ca. {b.suggest}</span></li>)}
          {buy.length === 0 && <li className="text-muted-foreground">Ingen bestillinger at regne på endnu</li>}
        </ul>
      </article>
      <article className="rounded-lg border bg-card p-4">
        <p className="flex items-center gap-2 text-sm font-semibold"><Star className="h-4 w-4 text-primary" />Gæsteanmeldelser{avg !== null && ` · ${avg}/5`}</p>
        <ul className="mt-3 space-y-2 text-sm">
          {feedback.slice(0, 3).map(f => <li key={f.id}><span className="font-semibold">Værelse {f.room_number} · {'★'.repeat(f.rating)}</span>{f.comment && <p className="break-words text-muted-foreground">{f.comment}</p>}</li>)}
          {feedback.length === 0 && <li className="text-muted-foreground">Ingen anmeldelser endnu</li>}
        </ul>
      </article>
    </section>
  );
}
