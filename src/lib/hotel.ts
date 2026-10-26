import { supabase } from "@/integrations/supabase/client";

export type GuestSession = {
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
};

export type HousekeepingStatus = "occupied" | "needs_cleaning" | "cleaning" | "clean";
export type OrderStatus = "pending" | "in_progress" | "done";

export const HOUSEKEEPING_LABELS: Record<HousekeepingStatus, string> = {
  occupied: "Gæst på værelset",
  needs_cleaning: "Skal rengøres",
  cleaning: "I gang med rengøring",
  clean: "Rengjort",
};

export const ORDER_LABELS: Record<OrderStatus, string> = {
  pending: "Afventer",
  in_progress: "I gang",
  done: "Gennemført",
};

export const nextOrderStatus = (s: OrderStatus): OrderStatus =>
  s === "pending" ? "in_progress" : s === "in_progress" ? "done" : "pending";

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
  if (m.includes("DEVICE_LIMIT")) return "Maks. antal enheder for værelset er nået.";
  if (m.includes("INVALID_LOGIN")) return "Bookingnummer eller værelsesnummer er forkert.";
  if (m.includes("FORBIDDEN")) return "Forkert personalekode.";
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
