import { supabase } from '@/integrations/supabase/client';
import { demoStore } from '@/lib/demo-db';

/**
 * Synkroniserer demoen mellem enheder (fx en telefon med gæsteappen og en computer med personalesiden).
 * Enhederne, der bruger samme kode, deler én Supabase-kanal (kun broadcast, ingen tabeller og ingen rigtige data).
 * Hver ændring sendes som hele demoens tilstand; den sidste ændring vinder, hvilket er rigeligt til en demo.
 */
export type SyncStatus = { connected: boolean; peers: number };
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_BYTES = 800_000;
const CODE_KEY = 'hp-demo-code';

export const newSyncCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => ALPHABET[b % ALPHABET.length]).join('');
export const cleanCode = (v: string | null | undefined) => (v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
export const savedSyncCode = () => { try { return cleanCode(sessionStorage.getItem(CODE_KEY)) || null; } catch { return null; } };
export const saveSyncCode = (code: string | null) => { try { if (code) sessionStorage.setItem(CODE_KEY, code); else sessionStorage.removeItem(CODE_KEY); } catch { /* ingen lagring */ } };

/**
 * Starter synkronisering. `host`: denne enhed har den tilstand, de andre skal overtage (den der oprettede koden).
 * Andre enheder beder om tilstanden, når de kommer med, og alle har samme tilstand derefter.
 */
export function startDemoSync(code: string, onStatus: (s: SyncStatus) => void, host = false): () => void {
  const me = crypto.randomUUID();
  let synced = host;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const channel = supabase.channel(`hp-demo-${code}`, { config: { broadcast: { self: false }, presence: { key: me } } });
  const push = () => {
    if (stopped || !synced) return;
    const state = demoStore.exportState();
    if (state.length > MAX_BYTES) return;
    void channel.send({ type: 'broadcast', event: 'state', payload: { state } });
  };
  const status = () => onStatus({ connected: !stopped, peers: Object.keys(channel.presenceState()).length });
  channel
    .on('broadcast', { event: 'state' }, ({ payload }) => {
      try { demoStore.importState((payload as { state: string }).state); synced = true; } catch { /* ignorér ugyldig tilstand */ }
    })
    .on('broadcast', { event: 'hello' }, () => { if (synced) push(); })
    .on('presence', { event: 'sync' }, status)
    .subscribe(st => {
      if (st !== 'SUBSCRIBED') { if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') onStatus({ connected: false, peers: 0 }); return; }
      void channel.track({ at: Date.now() });
      status();
      if (!host) {
        void channel.send({ type: 'broadcast', event: 'hello', payload: {} });
        // Svarer ingen, er denne enhed den første, og den bliver kilden for de næste.
        setTimeout(() => { synced = true; }, 2000);
      }
    });
  const unsub = demoStore.subscribe(() => {
    if (demoStore.lastChangeWasRemote()) return;
    clearTimeout(timer);
    timer = setTimeout(push, 120);
  });
  return () => { stopped = true; clearTimeout(timer); unsub(); void supabase.removeChannel(channel); onStatus({ connected: false, peers: 0 }); };
}
