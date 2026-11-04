import { describe, it, expect } from 'vitest';
import { fmtLeft, sortCleaning, timeLeft, todayAt } from '@/lib/cleaning';

const now = Date.parse('2026-01-01T10:00:00Z');
const at = (min: number) => new Date(now + min * 60000).toISOString();
const r = (id: string, until: number | null, created = 0) => ({ id, away_until: until === null ? null : at(until), created_at: at(created) });

describe('Rengøringskø', () => {
  it('kortest tid tilbage kommer først', () => {
    expect(sortCleaning([r('lang', 120), r('kort', 20), r('mellem', 60)], now).map(x => x.id)).toEqual(['kort', 'mellem', 'lang']);
  });
  it('udløbet tidsrum kommer efter, og "når som helst" til sidst', () => {
    expect(sortCleaning([r('altid', null, -5), r('udløbet', -10), r('kort', 15)], now).map(x => x.id)).toEqual(['kort', 'udløbet', 'altid']);
  });
  it('samme tid: ældste bestilling først', () => {
    expect(sortCleaning([r('ny', null, -1), r('gammel', null, -30)], now).map(x => x.id)).toEqual(['gammel', 'ny']);
  });
  it('viser tid tilbage', () => {
    expect(timeLeft({ away_until: at(30) }, now)).toBe(30 * 60000);
    expect(timeLeft({ away_until: null }, now)).toBeNull();
    expect(fmtLeft(45 * 60000)).toBe('45 min');
    expect(fmtLeft(130 * 60000)).toBe('2 t 10 min');
    expect(fmtLeft(0)).toBe('udløbet');
  });
  it('klokkeslæt omsættes til dagens dato', () => {
    const d = todayAt('13:30', new Date(2026, 0, 5, 9, 0));
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 0, 5, 13, 30]);
  });
});
