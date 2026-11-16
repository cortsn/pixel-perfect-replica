import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { RatingForm } from '@/components/hotel/rating';
import { guestRatingState, loadStored, rateStay, type RatingState } from '@/lib/hotel';

/** Skærmen efter opholdet: tak, og mulighed for at give en rating. */
export function StayEndedScreen({ onDone }: { onDone: () => void }) {
  const [state, setState] = useState<RatingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState(false);
  const stored = loadStored();
  useEffect(() => {
    if (!stored) return;
    guestRatingState(stored.t, stored.d).then(setState).catch(() => setState(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function send(rating: number, comment: string) {
    if (!stored || busy) return;
    setBusy(true);
    try { await rateStay(stored.t, stored.d, rating, comment); setThanks(true); toast.success('Tak for din rating'); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  const canRate = state && state.ended && !state.rated && !thanks;
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-7 text-center">
      <KeyRound className="h-10 w-10 text-brass" />
      <p className="font-display text-2xl">HotelPilot</p>
      <h1 className="text-4xl">Tak for dit ophold</h1>
      <p className="max-w-sm text-muted-foreground">Dit ophold er slut. Gå til receptionen og tjek ud, hvis du ikke allerede har gjort det.</p>
      {canRate && <div className="w-full rounded-2xl border bg-card p-5 shadow-sm"><RatingForm busy={busy} onSubmit={send} /></div>}
      {(thanks || state?.rated) && <p className="text-sm text-status-clean" role="status">Tak for din rating.</p>}
      <Button onClick={onDone}>Til forsiden</Button>
    </div>
  );
}
