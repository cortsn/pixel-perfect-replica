export type StayState = 'waiting' | 'active' | 'expired';
export function stayState(start: string, end: string, now: number): StayState {
  if (now >= Date.parse(end)) return 'expired';
  return now < Date.parse(start) ? 'waiting' : 'active';
}
export function cancellable(status: string) { return status === 'pending' || status === 'in_progress'; }
export function cleaningProgress(status: string) { return status === 'clean' ? 100 : status === 'cleaning' ? 60 : status === 'needs_cleaning' ? 15 : 0; }
export function countdown(start: string, now: number) {
  const seconds = Math.max(0, Math.ceil((Date.parse(start) - now) / 1000));
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
