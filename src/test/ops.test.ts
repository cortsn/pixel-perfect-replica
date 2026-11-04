import { describe, it, expect } from 'vitest';
import { towelsLeft, dinnerStats, isDelayed, purchaseSuggestions } from '@/lib/ops';
import { nextOrderStatus } from '@/lib/hotel';
describe('Operations rules', () => {
  it('towels: 4 guests may swap 4 towels, then none left', () => { expect(towelsLeft(4, 0)).toBe(4); expect(towelsLeft(4, 4)).toBe(0); expect(towelsLeft(4, 5)).toBe(0); });
  it('dinner counter counts guests eating vs total', () => { const s = dinnerStats([{ guests: 100, dinner_choice: 'hotel' }, { guests: 74, dinner_choice: 'out' }]); expect(s.eating).toBe(100); expect(s.total).toBe(174); expect(s.kg).toBe(50); });
  it('new orders are delayed after 10 minutes', () => { const t = Date.parse('2026-01-01T10:00:00Z'); expect(isDelayed('pending', '2026-01-01T09:49:00Z', t)).toBe(true); expect(isDelayed('pending', '2026-01-01T09:55:00Z', t)).toBe(false); expect(isDelayed('done', '2026-01-01T08:00:00Z', t)).toBe(false); });
  it('order columns flow Ny → I gang → Klar → Leveret', () => { expect(nextOrderStatus('pending')).toBe('in_progress'); expect(nextOrderStatus('in_progress')).toBe('ready'); expect(nextOrderStatus('ready')).toBe('done'); });
});

describe('purchaseSuggestions', () => {
  it('tæller varer i en kurv hver for sig', () => {
    const r = purchaseSuggestions([{ type: 'room_service', details: '2× Club sandwich, 1× Kaffe & croissant — Note: uden løg' }, { type: 'room_service', details: 'Club sandwich' }]);
    expect(r.find(x => x.item === 'Club sandwich')?.used).toBe(3);
    expect(r.find(x => x.item === 'Kaffe & croissant')?.used).toBe(1);
  });
});
