import { supabase } from "@/integrations/supabase/client";

export type CleaningStatus = "requested" | "in_progress" | "done" | "not_reached";
export type CleaningRequest = {
  id: string;
  room_number: string;
  guest_name?: string;
  wants_towels: boolean;
  /** Antal håndklæder der skal byttes. Mangler på ældre rækker. */
  towel_count?: number;
  away_from: string | null;
  away_until: string | null;
  status: CleaningStatus;
  is_repeat: boolean;
  /** 'checkout' = oprettet automatisk ved checkout. */
  kind?: 'guest' | 'checkout';
  created_at: string;
  updated_at?: string;
};
export type EarlyCheckin = {
  id: string;
  reference: string;
  room_number: string;
  guest_name: string;
  starts_at: string;
  early_checkin_time: string | null;
  early_checkin_status: "requested" | "approved" | "declined" | null;
  housekeeping_status: string;
};

export const CLEANING_LABELS: Record<CleaningStatus, string> = {
  requested: "Bestilt",
  in_progress: "I gang",
  done: "Færdig",
  not_reached: "Ikke nået",
};
export const isOpen = (s: CleaningStatus) => s === "requested" || s === "in_progress";

/** Ms tilbage af gæstens fravær. null = intet tidsrum (når som helst). */
export function timeLeft(r: Pick<CleaningRequest, "away_until">, now: number) {
  return r.away_until ? Date.parse(r.away_until) - now : null;
}

/** "2 t 10 min", "45 min" eller "udløbet". */
export function fmtLeft(ms: number) {
  if (ms <= 0) return "udløbet";
  const min = Math.ceil(ms / 60000);
  const h = Math.floor(min / 60);
  return h > 0 ? `${h} t ${min % 60} min` : `${min} min`;
}

/** Genbestillinger (ikke nået første gang) først, derefter kortest tid tilbage. Udløbne tidsrum kommer efter, og "når som helst" til sidst. */
export function sortCleaning<T extends Pick<CleaningRequest, "away_until" | "created_at"> & { is_repeat?: boolean }>(list: T[], now: number): T[] {
  const key = (r: T) => {
    const left = timeLeft(r, now);
    return left === null ? Number.MAX_SAFE_INTEGER : left <= 0 ? Number.MAX_SAFE_INTEGER / 2 : left;
  };
  return [...list].sort((a, b) => Number(!!b.is_repeat) - Number(!!a.is_repeat) || key(a) - key(b) || Date.parse(a.created_at) - Date.parse(b.created_at));
}

type RpcResult<T> = { data: T | null; error: { message?: string } | null };
type RpcBackend = { call: (name: string, args: Record<string, unknown>) => Promise<RpcResult<unknown>>; subscribe: (listener: () => void) => () => void };
let backend: RpcBackend | null = null;
/** Bruges af /demo: personalesiden taler så med en database i browseren i stedet for Supabase. */
export function setRpcBackend(b: RpcBackend | null) { backend = b; }
export const isDemoBackend = () => backend !== null;
/** Lyt efter ændringer i demo-databasen. Giver null, når der bruges den rigtige database. */
export function subscribeRpcChanges(listener: () => void): (() => void) | null { return backend ? backend.subscribe(listener) : null; }

/** Kalde-hjælper, så koden virker, før de genererede databasetyper kender de nye funktioner. */
export function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<RpcResult<T>> {
  if (backend) return backend.call(name, args) as Promise<RpcResult<T>>;
  return supabase.rpc(name as never, args as never) as unknown as Promise<RpcResult<T>>;
}

/** Dato i dag (lokal tid) med klokkeslæt "HH:MM". */
export function todayAt(hhmm: string, base = new Date()) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(base);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

/** "Byt 2 håndklæder" / "Ingen håndklædebytte". */
export function towelText(r: Pick<CleaningRequest, "wants_towels" | "towel_count">) {
  const n = r.towel_count ?? (r.wants_towels ? 1 : 0);
  return n > 0 ? `Byt ${n} ${n === 1 ? "håndklæde" : "håndklæder"}` : "Ingen håndklædebytte";
}
