import { useState } from 'react';
import { Search, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OpsPanel } from '@/components/hotel/ops-panel';
import { ORDER_LABELS, type OrderStatus } from '@/lib/hotel';
import { categoryLabel } from '@/lib/billing';
import { fmtDKK } from '@/lib/money';
import { PageTitle, card, dayTime, field, useDebounced, useStaff, useStaffData } from '@/components/staff/core';

type Stats = {
  days: number; revenue_by_day: { day: string; cents: number }[]; revenue_by_category: { category: string; cents: number }[];
  top_items: { description: string; qty: number; cents: number }[]; orders_by_status: { status: OrderStatus; n: number }[];
  rating_avg: number | null; rating_count: number; checkouts: number;
};

/** Statistik: omsætning, populære varer, ordrer og gæsternes ratings. */
export function StatsPage() {
  const { pin } = useStaff();
  const [days, setDays] = useState(14);
  const { data, error } = useStaffData<Stats>('staff_stats', { _days: days }, 30000);
  const total = (data?.revenue_by_day ?? []).reduce((s, d) => s + Number(d.cents), 0);
  const max = Math.max(1, ...(data?.revenue_by_day ?? []).map(d => Number(d.cents)));
  return (
    <>
      <PageTitle title="Statistik" hint={`De seneste ${days} dage`} actions={[7, 14, 30].map(d => <Button key={d} size="sm" variant={days === d ? 'default' : 'outline'} aria-pressed={days === d} onClick={() => setDays(d)}>{d} dage</Button>)} />
      {!data ? <p className="py-10 text-center text-sm text-muted-foreground">{error ?? 'Henter statistik…'}</p> : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className={card}><p className="text-sm text-muted-foreground">Omsætning</p><p className="mt-2 font-display text-4xl leading-none tabular-nums">{fmtDKK(total)}</p></div>
            <div className={card}><p className="text-sm text-muted-foreground">Checkouts</p><p className="mt-2 font-display text-4xl leading-none tabular-nums">{data.checkouts}</p></div>
            <div className={card}><p className="text-sm text-muted-foreground">Gæstevurdering</p><p className="mt-2 font-display text-4xl leading-none tabular-nums">{data.rating_avg ? `${data.rating_avg}/5` : '–'}</p><p className="mt-2 text-xs text-muted-foreground">{data.rating_count} {data.rating_count === 1 ? 'vurdering' : 'vurderinger'}</p></div>
          </div>
          <section className={card}>
            <h2 className="text-xl">Omsætning pr. dag</h2>
            {data.revenue_by_day.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Intet salg i perioden.</p> : (
              <ul className="mt-3 space-y-1.5" aria-label="Omsætning pr. dag">
                {data.revenue_by_day.map(d => (
                  <li key={d.day} className="grid grid-cols-[4.5rem_1fr_6rem] items-center gap-3 text-sm">
                    <span className="text-muted-foreground">{new Date(d.day).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}</span>
                    <span className="h-3 overflow-hidden rounded-full bg-secondary"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (Math.max(0, Number(d.cents)) / max) * 100)}%` }} /></span>
                    <span className="text-right tabular-nums">{fmtDKK(Number(d.cents))}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <div className="grid gap-6 lg:grid-cols-3">
            <section className={card}><h2 className="text-xl">Omsætning pr. kategori</h2>
              <ul className="mt-3 divide-y text-sm">{data.revenue_by_category.map(c => <li key={c.category} className="flex justify-between py-2"><span>{categoryLabel(c.category)}</span><span className="tabular-nums">{fmtDKK(Number(c.cents))}</span></li>)}{data.revenue_by_category.length === 0 && <li className="py-2 text-muted-foreground">Ingen data</li>}</ul></section>
            <section className={card}><h2 className="text-xl">Mest solgte</h2>
              <ul className="mt-3 divide-y text-sm">{data.top_items.map(i => <li key={i.description} className="flex justify-between gap-3 py-2"><span className="min-w-0 break-words">{i.description}</span><span className="shrink-0 tabular-nums text-muted-foreground">{i.qty} stk. · {fmtDKK(Number(i.cents))}</span></li>)}{data.top_items.length === 0 && <li className="py-2 text-muted-foreground">Ingen data</li>}</ul></section>
            <section className={card}><h2 className="text-xl">Ordrer</h2>
              <ul className="mt-3 divide-y text-sm">{data.orders_by_status.map(o => <li key={o.status} className="flex justify-between py-2"><span>{ORDER_LABELS[o.status] ?? o.status}</span><span className="tabular-nums">{o.n}</span></li>)}{data.orders_by_status.length === 0 && <li className="py-2 text-muted-foreground">Ingen ordrer</li>}</ul></section>
          </div>
        </div>
      )}
      <div className="-mx-4 mt-8 border-t lg:-mx-8"><OpsPanel pin={pin} /></div>
    </>
  );
}

type Review = { id: string; room_number: string; rating: number; comment: string; created_at: string; guest_name: string | null; reference: string | null };
type Reviews = { count: number; avg: number | null; distribution: { rating: number; n: number }[]; items: Review[] };

const Stars = ({ n }: { n: number }) => <span className="inline-flex gap-0.5" role="img" aria-label={`${n} af 5 stjerner`}>{[1, 2, 3, 4, 5].map(i => <Star key={i} className={`h-4 w-4 ${i <= n ? 'fill-brass text-brass' : 'text-muted-foreground/40'}`} />)}</span>;

/** Alle gæsteanmeldelser: gennemsnit, fordeling, søgning og filter på antal stjerner. */
function ReviewsPage() {
  const [rating, setRating] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data, error } = useStaffData<Reviews>('staff_feedback', { _rating: rating, _q: dq.trim() }, 30000);
  const total = data?.count ?? 0;
  return (
    <>
      <PageTitle title="Ratings & anmeldelser" hint="Alt hvad gæsterne har skrevet efter deres ophold." />
      {!data ? <p className="py-10 text-center text-sm text-muted-foreground">{error ?? 'Henter anmeldelser…'}</p> : (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <aside className={`${card} self-start`}>
            <p className="text-sm text-muted-foreground">Gennemsnit</p>
            <p className="mt-1 font-display text-5xl leading-none tabular-nums">{data.avg ?? '–'}<span className="text-xl text-muted-foreground"> / 5</span></p>
            <p className="mt-1 text-xs text-muted-foreground">{total} {total === 1 ? 'anmeldelse' : 'anmeldelser'}</p>
            <ul className="mt-4 space-y-1.5" aria-label="Fordeling">
              {data.distribution.map(d => (
                <li key={d.rating}>
                  <button type="button" aria-pressed={rating === d.rating} onClick={() => setRating(rating === d.rating ? null : d.rating)} className={`grid w-full grid-cols-[2rem_1fr_2rem] items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent ${rating === d.rating ? 'bg-accent font-semibold' : ''}`}>
                    <span className="flex items-center gap-0.5">{d.rating}<Star className="h-3.5 w-3.5 fill-brass text-brass" /></span>
                    <span className="h-2 overflow-hidden rounded-full bg-secondary"><span className="block h-full rounded-full bg-brass" style={{ width: `${total ? (d.n / total) * 100 : 0}%` }} /></span>
                    <span className="text-right tabular-nums text-muted-foreground">{d.n}</span>
                  </button>
                </li>
              ))}
            </ul>
            {rating !== null && <Button size="sm" variant="ghost" className="mt-2" onClick={() => setRating(null)}>Vis alle vurderinger</Button>}
          </aside>
          <section className="min-w-0">
            <label className="relative mb-3 block sm:max-w-sm"><span className="sr-only">Søg i anmeldelser</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Søg navn, værelse eller tekst" className={`${field} pl-9`} /></label>
            <ul className="space-y-2">
              {data.items.map(r => (
                <li key={r.id} className={card}>
                  <div className="flex flex-wrap items-center justify-between gap-2"><Stars n={r.rating} /><span className="text-xs text-muted-foreground">{dayTime(r.created_at)}</span></div>
                  {r.comment ? <p className="mt-2 break-words text-sm">{r.comment}</p> : <p className="mt-2 text-sm italic text-muted-foreground">Ingen kommentar</p>}
                  <p className="mt-2 text-xs text-muted-foreground">{r.guest_name ?? 'Gæst'} · Værelse {r.room_number}{r.reference ? ` · ${r.reference}` : ''}</p>
                </li>
              ))}
              {data.items.length === 0 && <li className={`${card} py-10 text-center text-sm text-muted-foreground`}>Ingen anmeldelser matcher</li>}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}

/** Statistik: dashboardet som hovedside og undersiden med ratings og anmeldelser. */
export function StatsSection({ page }: { page: string }) {
  return page === 'reviews' ? <ReviewsPage /> : <StatsPage />;
}
