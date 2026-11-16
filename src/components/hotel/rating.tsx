import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Rating efter opholdet: 1-5 stjerner og en valgfri kommentar. */
export function RatingForm({ busy, onSubmit }: { busy?: boolean; onSubmit: (rating: number, comment: string) => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  return (
    <div className="w-full space-y-3 text-center">
      <h2 className="flex items-center justify-center gap-2 text-xl"><Star className="h-5 w-5 text-brass" />Hvordan var dit ophold?</h2>
      <div className="flex justify-center gap-1" role="group" aria-label="Bedømmelse">
        {[1, 2, 3, 4, 5].map(n => <Button key={n} type="button" size="icon" variant={rating >= n ? 'default' : 'outline'} aria-label={`${n} stjerner`} aria-pressed={rating >= n} onClick={() => setRating(n)}><Star /></Button>)}
      </div>
      <textarea value={comment} onChange={e => setComment(e.target.value.slice(0, 1000))} placeholder="Skriv gerne en kommentar (valgfri)" className="w-full rounded-md border bg-card p-2 text-sm" rows={3} />
      <Button className="w-full" disabled={busy} onClick={() => onSubmit(rating, comment)}>Send rating</Button>
    </div>
  );
}
