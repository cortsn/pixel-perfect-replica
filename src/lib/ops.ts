export const KG_PER_DINNER = 0.5;
export function towelsLeft(limit: number, used: number) { return Math.max(0, limit - used); }
export function dinnerStats(bookings: { guests: number; dinner_choice: string | null }[]) {
  const total = bookings.reduce((a, b) => a + b.guests, 0);
  const eating = bookings.filter(b => b.dinner_choice === 'hotel').reduce((a, b) => a + b.guests, 0);
  const unanswered = bookings.filter(b => !b.dinner_choice).reduce((a, b) => a + b.guests, 0);
  return { total, eating, unanswered, pct: total ? Math.round((eating / total) * 100) : 0, kg: Math.round(eating * KG_PER_DINNER * 10) / 10 };
}
/** Minutes after which an order counts as delayed, per status. */
export const DELAY_MIN: Record<string, number> = { pending: 10, in_progress: 20, ready: 10 };
export function isDelayed(status: string, since: string, now: number) {
  const limit = DELAY_MIN[status];
  return limit !== undefined && now - Date.parse(since) > limit * 60000;
}
export function purchaseSuggestions(orders: { type: string; details: string; quantity?: number; cancelled?: boolean }[], days = 7) {
  const counts = new Map<string, number>();
  for (const o of orders) { if (o.cancelled) continue; const k = o.type === 'towels' ? 'Håndklæder (vask)' : o.details; counts.set(k, (counts.get(k) ?? 0) + (o.type === 'towels' ? (o.quantity ?? 1) : 1)); }
  return [...counts.entries()].map(([item, used]) => ({ item, used, perDay: Math.round((used / days) * 10) / 10, suggest: Math.ceil(used * 1.2) })).sort((a, b) => b.used - a.used);
}
