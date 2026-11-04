import { supabase } from "@/integrations/supabase/client";

export type GuestSession = {
  starts_at: string;
  ends_at: string;
  server_now: string;
  dinner_choice: "hotel" | "out" | null;
  access_token: string;
  device_id: string;
  guest_name: string;
  room_number: string;
  reference: string;
  capacity: number;
  max_devices: number;
  devices: number;
  housekeeping_status: HousekeepingStatus;
  wifi_ssid: string;
  wifi_password: string;
  guests: number;
  towel_limit: number;
  towels_used: number;
  feedback_given: boolean;
};

export type HousekeepingStatus = "occupied" | "needs_cleaning" | "cleaning" | "clean";
export type OrderStatus = "pending" | "in_progress" | "ready" | "done" | "cancelled";

export const HOUSEKEEPING_LABELS: Record<HousekeepingStatus, string> = {
  occupied: "Gæst på værelset",
  needs_cleaning: "Skal rengøres",
  cleaning: "I gang med rengøring",
  clean: "Rengjort",
};

export const ORDER_LABELS: Record<OrderStatus, string> = {
  pending: "Ny",
  in_progress: "I gang",
  ready: "Klar",
  done: "Leveret",
  cancelled: "Annulleret",
};

export const nextOrderStatus = (s: OrderStatus): OrderStatus =>
  s === "pending" ? "in_progress" : s === "in_progress" ? "ready" : s === "ready" ? "done" : s;

const KEY = "hotelpilot-guest";

export function saveSession(s: GuestSession) {
  localStorage.setItem(KEY, JSON.stringify({ t: s.access_token, d: s.device_id }));
}
export function loadStored(): { t: string; d: string } | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}
export function clearSession() {
  localStorage.removeItem(KEY);
}

export function errorText(e: { message?: string } | null) {
  const m = e?.message ?? "";
  if (m.includes("STAY_EXPIRED")) return "Dit ophold er desværre stoppet. Gå til receptionen og tjek ud. Tak for dit ophold.";
  if (m.includes("STAY_NOT_STARTED")) return "Dit ophold er ikke startet endnu.";
  if (m.includes("ROOM_BUSY")) return "Værelset er allerede booket i det valgte tidsrum.";
  if (m.includes("ORDER_NOT_CANCELLABLE")) return "Bestillingen er allerede afsluttet eller annulleret.";
  if (m.includes("DEVICE_LIMIT")) return "Maks. antal enheder for værelset er nået.";
  if (m.includes("INVALID_LOGIN")) return "Bookingnummer eller værelsesnummer er forkert.";
  if (m.includes("TOWEL_LIMIT")) return "Du har bestilt det maksimale antal håndklæder for dit ophold.";
  if (m.includes("INVALID_GUESTS")) return "Antal gæster passer ikke til værelset.";
  if (m.includes("INVALID_BOOKING")) return "Udfyld navn og en gyldig e-mail.";
  if (m.includes("FORBIDDEN")) return "Forkert personalekode.";
  if (m.includes("INVALID_WINDOW")) return "Tidsrummet er ugyldigt. Slut skal være efter start.";
  if (m.includes("CLEANING_ALREADY_REQUESTED")) return "Du har allerede bestilt rengøring.";
  if (m.includes("INVALID_TIME")) return "Vælg et tidspunkt før dit normale check-in.";
  if (m.includes("EARLY_ALREADY_APPROVED")) return "Din tidlige check-in er allerede godkendt.";
  if (m.includes("EARLY_NOT_APPLICABLE")) return "Dit ophold er allerede startet.";
  if (m.includes("REQUEST_CLOSED")) return "Anmodningen er allerede lukket.";
  return "Noget gik galt. Prøv igen.";
}

export async function guestLogin(reference: string, room: string) {
  const { data, error } = await supabase.rpc("guest_login", { _reference: reference, _room: room });
  if (error) throw new Error(errorText(error));
  return data as unknown as GuestSession;
}
export async function guestJoin(token: string) {
  const { data, error } = await supabase.rpc("guest_join", { _token: token });
  if (error) throw new Error(errorText(error));
  return data as unknown as GuestSession;
}
export async function guestSession(token: string, device: string) {
  const { data, error } = await supabase.rpc("guest_session", { _token: token, _device: device });
  if (error) throw new Error(errorText(error));
  return data as unknown as GuestSession;
}
