import { supabase } from "@/integrations/supabase/client";

/**
 * Signal mellem demo-appen og dør-skærmen (/dor). Bruger Supabase Realtime Broadcast, så ingen
 * tabeller eller migrationer er nødvendige. Kanalen er åben for alle, så den må kun bruges til demo.
 */
const CHANNEL = "hotelpilot-demo-door";
const EVENT = "open";

export async function sendDoorOpen(): Promise<boolean> {
  const ch = supabase.channel(CHANNEL);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { void supabase.removeChannel(ch); resolve(false); }, 4000);
    ch.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      const res = await ch.send({ type: "broadcast", event: EVENT, payload: { at: Date.now() } });
      clearTimeout(timer);
      void supabase.removeChannel(ch);
      resolve(res === "ok");
    });
  });
}

/** Lytter efter "åbn". Returnerer en funktion, der stopper lytningen. onStatus får true, når forbindelsen er oppe. */
export function listenDoorOpen(onOpen: () => void, onStatus?: (connected: boolean) => void): () => void {
  const ch = supabase.channel(CHANNEL).on("broadcast", { event: EVENT }, () => onOpen());
  ch.subscribe((status) => onStatus?.(status === "SUBSCRIBED"));
  return () => { void supabase.removeChannel(ch); };
}
