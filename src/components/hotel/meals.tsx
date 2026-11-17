import { Check, Leaf } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MEAL_FIELD, MEAL_LABELS, type Meal } from '@/lib/hotel';

type Choices = { breakfast_choice: 'hotel' | 'out' | null; lunch_choice: 'hotel' | 'out' | null; dinner_choice: 'hotel' | 'out' | null };
const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner'];
export const MADSPILD_NOTE = 'Når du svarer, er du med til at mindske madspild.';

export function mealSummary(c: Choices) {
  return MEALS.map(m => ({ meal: m, label: MEAL_LABELS[m], choice: c[MEAL_FIELD[m]] }));
}

/** Kort på forsiden: kun "Vælg måltider". Valgte måltider dukker op over knappen. */
export function MealsCard({ choices, onOpen }: { choices: Choices; onOpen: () => void }) {
  const chosen = mealSummary(choices).filter(m => m.choice);
  return (
    <section id="maaltider" className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <Leaf className="mt-1 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h2 className="text-xl">Vælg måltider</h2>
          <p className="mt-1 text-sm text-muted-foreground">{MADSPILD_NOTE}</p>
        </div>
      </div>
      {chosen.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2 text-xs" aria-label="Dine valgte måltider">
          {chosen.map(m => (
            <li key={m.meal} className={`rounded-full border px-3 py-1 ${m.choice === 'hotel' ? 'border-primary/40 bg-primary/10 font-semibold text-primary' : ''}`}>
              {m.label}: {m.choice === 'hotel' ? 'på hotellet' : 'ude'}
            </li>
          ))}
        </ul>
      )}
      <Button className="mt-4 w-full" variant="outline" onClick={onOpen}>Vælg måltider</Button>
    </section>
  );
}

/** Menuen: vælg for hvert måltid. Tryk igen for at fjerne valget. */
export function MealsForm({ choices, busy, onChoose }: { choices: Choices; busy?: boolean; onChoose: (meal: Meal, choice: 'hotel' | 'out') => void }) {
  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-lg bg-secondary p-3 text-sm"><Leaf className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{MADSPILD_NOTE}</p>
      {mealSummary(choices).map(m => (
        <div key={m.meal}>
          <p className="mb-2 font-semibold">{m.label}</p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label={m.label}>
            {(['hotel', 'out'] as const).map(c => (
              <Button key={c} type="button" disabled={busy} variant={m.choice === c ? 'default' : 'outline'} aria-pressed={m.choice === c} onClick={() => onChoose(m.meal, c)}>
                {m.choice === c && <Check />}{c === 'hotel' ? 'På hotellet' : 'Ude'}
              </Button>
            ))}
          </div>
        </div>
      ))}
      <p className="text-center text-xs text-muted-foreground">Tryk på dit valg igen for at fjerne det.</p>
    </div>
  );
}
