import { describe,it,expect } from 'vitest';
import { stayState,cancellable,cleaningProgress } from '@/lib/stay';
const start='2026-10-27T14:00:00Z', end='2026-10-28T10:00:00Z';
describe('Official booking boundaries',()=>{
 it('locks all features before the official start',()=>expect(stayState(start,end,Date.parse(start)-1)).toBe('waiting'));
 it('unlocks at the exact start',()=>expect(stayState(start,end,Date.parse(start))).toBe('active'));
 it('locks at the exact checkout instant',()=>expect(stayState(start,end,Date.parse(end))).toBe('expired'));
 it('allows cancellation of active orders only',()=>{expect(cancellable('pending')).toBe(true);expect(cancellable('in_progress')).toBe(true);expect(cancellable('done')).toBe(false);expect(cancellable('cancelled')).toBe(false);});
 it('shows staff cleaning progress and resets to zero',()=>{expect(cleaningProgress('cleaning')).toBe(60);expect(cleaningProgress('clean')).toBe(100);expect(cleaningProgress('occupied')).toBe(0);});
});
