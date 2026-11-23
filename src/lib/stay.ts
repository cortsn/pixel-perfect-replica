export type StayState = 'waiting' | 'active' | 'expired';
export function stayState(start: string, end: string, now: number): StayState {
  if (now >= Date.parse(end)) return 'expired';
  return now < Date.parse(start) ? 'waiting' : 'active';
}
export function cancellable(status: string) { return status === 'pending' || status === 'accepted' || status === 'in_progress'; }
export function cleaningProgress(status: string) { return status === 'clean' ? 100 : status === 'cleaning' ? 60 : status === 'needs_cleaning' ? 15 : 0; }
export function countdown(start: string, now: number) {
  const seconds = Math.max(0, Math.ceil((Date.parse(start) - now) / 1000));
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
const hm = (iso: string) => new Date(iso).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
const dayTime = (iso: string) => new Date(iso).toLocaleString('da-DK', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export { hm, dayTime };
/** "1 d 3 t", "2 t 14 min" eller "12 min". */
export function remaining(end: string, now: number) {
  const min = Math.max(0, Math.ceil((Date.parse(end) - now) / 60000));
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  if (d > 0) return `${d} d ${h} t`;
  return h > 0 ? `${h} t ${m} min` : `${m} min`;
}
/** Besked til gæsten, når hotellet har ændret opholdets tider. */
export function noticeText(kind: 'start' | 'end' | 'both', startsAt: string, endsAt: string) {
  const start = `Hotellet har ændret din starttid. Du kan tjekke ind ${dayTime(startsAt)}.`;
  const end = `Hotellet har ændret din check ud-tid til ${dayTime(endsAt)}.`;
  return kind === 'start' ? start : kind === 'end' ? end : `${start} ${end}`;
}
/** Håndklæder kan bestilles 1 gang hver 12. time. */
export const TOWEL_COOLDOWN_MS = 12 * 60 * 60 * 1000;
/** Tidspunkt (ms) hvor næste håndklædebestilling er mulig, eller null hvis den er mulig nu. Annullerede bestillinger tæller ikke. */
export function towelNextAt(orders: { type: string; status: string; created_at: string }[], now: number): number | null {
  const last = orders.filter(o => o.type === 'towels' && o.status !== 'cancelled').reduce((a, o) => Math.max(a, Date.parse(o.created_at)), 0);
  const next = last + TOWEL_COOLDOWN_MS;
  return last > 0 && next > now ? next : null;
}
