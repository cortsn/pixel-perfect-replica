import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (m: { payload?: unknown }) => void;
const sent: { event: string; payload: { state?: string } }[] = [];
const handlers = new Map<string, Handler>();
vi.mock('@/integrations/supabase/client', () => {
  const channel = {
    on(_t: string, f: { event: string }, h: Handler) { handlers.set(f.event, h); return channel; },
    subscribe(cb: (s: string) => void) { cb('SUBSCRIBED'); return channel; },
    track: async () => 'ok',
    send: async (m: { event: string; payload: { state?: string } }) => { sent.push(m); return 'ok'; },
    presenceState: () => ({ a: [], b: [] }),
  };
  return { supabase: { channel: () => channel, removeChannel: async () => 'ok' } };
});

import { DEMO_PIN, demoRpc, demoStore } from '@/lib/demo-db';
import { cleanCode, newSyncCode, startDemoSync } from '@/lib/demo-sync';

beforeEach(() => { demoStore.reset(); sent.length = 0; handlers.clear(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe('demo-synkronisering mellem enheder', () => {
  it('koder er korte, store og uden tvetydige tegn', () => {
    expect(newSyncCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(cleanCode(' k7p-2qx!! ')).toBe('K7P2QX');
  });

  it('tilstanden kan eksporteres og overtages af en anden enhed', async () => {
    await demoRpc('staff_post_announcement', { _pin: DEMO_PIN, _message: 'Hej fra computeren' });
    const snapshot = demoStore.exportState();
    demoStore.reset();
    expect(demoStore._state().announcements).toHaveLength(0);
    demoStore.importState(snapshot);
    expect(demoStore._state().announcements.map(a => a.message)).toEqual(['Hej fra computeren']);
    expect(demoStore.lastChangeWasRemote()).toBe(true);
    expect(() => demoStore.importState('{"nonsens":true}')).toThrow();
  });

  it('lokale ændringer sendes, men modtagne ændringer sendes ikke videre', async () => {
    const stop = startDemoSync('ABC123', () => {}, true);
    await demoRpc('staff_post_announcement', { _pin: DEMO_PIN, _message: 'Ny besked' });
    vi.advanceTimersByTime(200);
    expect(sent.filter(m => m.event === 'state')).toHaveLength(1);
    expect(JSON.parse(sent[0]!.payload.state!).announcements[0].message).toBe('Ny besked');

    sent.length = 0;
    handlers.get('state')!({ payload: { state: demoStore.exportState() } });
    vi.advanceTimersByTime(500);
    expect(sent).toHaveLength(0);
    stop();
  });

  it('en ny enhed beder om tilstanden, og kilden svarer', () => {
    const stop = startDemoSync('ABC123', () => {}, true);
    sent.length = 0;
    handlers.get('hello')!({});
    expect(sent.map(m => m.event)).toEqual(['state']);
    stop();
  });

  it('en enhed, der kommer med, sender hello og overtager svaret', async () => {
    await demoRpc('staff_post_announcement', { _pin: DEMO_PIN, _message: 'Fra værten' });
    const snapshot = demoStore.exportState();
    demoStore.reset();
    const stop = startDemoSync('ABC123', () => {}, false);
    expect(sent.map(m => m.event)).toContain('hello');
    handlers.get('state')!({ payload: { state: snapshot } });
    expect(demoStore._state().announcements).toHaveLength(1);
    stop();
  });
});
