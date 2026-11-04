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
  const add = (k: string, n: number) => counts.set(k, (counts.get(k) ?? 0) + n);
  for (const o of orders) {
    if (o.cancelled) continue;
    if (o.type === 'towels') { add('Håndklæder (vask)', o.quantity ?? 1); continue; }
    // Kurve gemmes som "2× Club sandwich, 1× Kaffe — Note: …": tæl hver vare for sig.
    for (const part of o.details.split(' — Note:')[0]!.split(', ')) {
      const m = /^(\d+)× (.+)$/.exec(part.trim());
      add(m ? m[2]! : part.trim(), m ? Number(m[1]) : 1);
    }
  }
  return [...counts.entries()].map(([item, used]) => ({ item, used, perDay: Math.round((used / days) * 10) / 10, suggest: Math.ceil(used * 1.2) })).sort((a, b) => b.used - a.used);
}
