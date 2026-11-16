import { Utensils } from 'lucide-react';
import { mealStats } from '@/lib/ops';

/** Personalets overblik: hvor mange spiser på hotellet i dag. */
export function MealsOverview({ stats }: { stats: ReturnType<typeof mealStats> }) {
  const rows = [['Morgenmad', stats.breakfast], ['Frokost', stats.lunch], ['Aftensmad', stats.dinner]] as const;
  return (
    <article className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-semibold"><Utensils className="h-4 w-4 text-primary" />Spiser på hotellet i dag</p>
      <ul className="mt-3 space-y-2">
        {rows.map(([label, c]) => (
          <li key={label} className="flex items-baseline justify-between gap-3">
            <span className="text-sm">{label}</span>
            <span><span className="text-2xl font-semibold tabular-nums">{c.eating}</span><span className="text-sm text-muted-foreground"> / {stats.total}</span></span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Antal personer · {stats.dinner.unanswered} har ikke svaret om aftensmad</p>
    </article>
  );
}
