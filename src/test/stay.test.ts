import { describe,it,expect } from 'vitest';
import { stayState,cancellable,cleaningProgress,towelNextAt,TOWEL_COOLDOWN_MS } from '@/lib/stay';
const start='2026-10-27T14:00:00Z', end='2026-10-28T10:00:00Z';
describe('Official booking boundaries',()=>{
 it('locks all features before the official start',()=>expect(stayState(start,end,Date.parse(start)-1)).toBe('waiting'));
 it('unlocks at the exact start',()=>expect(stayState(start,end,Date.parse(start))).toBe('active'));
 it('locks at the exact checkout instant',()=>expect(stayState(start,end,Date.parse(end))).toBe('expired'));
 it('allows cancellation of active orders only',()=>{expect(cancellable('pending')).toBe(true);expect(cancellable('in_progress')).toBe(true);expect(cancellable('done')).toBe(false);expect(cancellable('cancelled')).toBe(false);});
 it('shows staff cleaning progress and resets to zero',()=>{expect(cleaningProgress('cleaning')).toBe(60);expect(cleaningProgress('clean')).toBe(100);expect(cleaningProgress('occupied')).toBe(0);});
});

describe('Towel orders: once every 12 hours',()=>{
 const t0=Date.parse('2026-10-27T14:00:00Z');const o=(status:string,at:number,type='towels')=>({type,status,created_at:new Date(at).toISOString()});
 it('is allowed with no earlier towel order',()=>expect(towelNextAt([],t0)).toBeNull());
 it('blocks until 12 hours after the last order',()=>expect(towelNextAt([o('pending',t0)],t0+3600000)).toBe(t0+TOWEL_COOLDOWN_MS));
 it('allows again exactly after 12 hours',()=>expect(towelNextAt([o('done',t0)],t0+TOWEL_COOLDOWN_MS)).toBeNull());
 it('ignores cancelled orders and other order types',()=>expect(towelNextAt([o('cancelled',t0),o('pending',t0,'room_service')],t0+1000)).toBeNull());
});
describe('Order cancellation window',()=>{
 it('allows cancelling until the kitchen has finished',()=>{expect(cancellable('accepted')).toBe(true);expect(cancellable('ready')).toBe(false);expect(cancellable('rejected')).toBe(false);});
});
