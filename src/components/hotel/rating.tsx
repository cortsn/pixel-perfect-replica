import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const RATING_WORDS = ['', 'Dårligt', 'Under middel', 'Okay', 'Godt', 'Fremragende'] as const;

/** Rating efter opholdet. Intet er valgt fra start; valgte stjerner er fyldte, og teksten viser tydeligt hvor mange der er valgt. */
export function RatingForm({ busy, onSubmit }: { busy?: boolean; onSubmit: (rating: number, comment: string) => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  return (
    <div className="w-full space-y-3 text-center">
      <h2 className="flex items-center justify-center gap-2 text-xl"><Star className="h-5 w-5 text-brass" />Hvordan var dit ophold?</h2>
      <div className="flex justify-center gap-1.5" role="radiogroup" aria-label="Bedømmelse">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} ${n === 1 ? 'stjerne' : 'stjerner'}`} onClick={() => setRating(n)}
            className="rounded-md p-1 transition active:scale-90">
            <Star className={`h-10 w-10 ${rating >= n ? 'fill-brass text-brass' : 'text-muted-foreground/40'}`} />
          </button>
        ))}
      </div>
      <p className="min-h-6 text-sm font-medium" role="status" aria-live="polite">
        {rating === 0 ? <span className="text-muted-foreground">Tryk på en stjerne for at vælge</span> : <>{rating} af 5 stjerner · {RATING_WORDS[rating]}</>}
      </p>
      <textarea value={comment} onChange={e => setComment(e.target.value.slice(0, 1000))} placeholder="Skriv gerne en kommentar (valgfri)" className="w-full rounded-md border bg-card p-2 text-sm" rows={3} />
      <Button className="w-full" disabled={busy || rating === 0} onClick={() => onSubmit(rating, comment)}>{rating === 0 ? 'Vælg stjerner først' : 'Send anmeldelse'}</Button>
    </div>
  );
}
