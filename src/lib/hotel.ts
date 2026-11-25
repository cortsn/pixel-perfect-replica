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
  breakfast_choice: "hotel" | "out" | null;
  lunch_choice: "hotel" | "out" | null;
  checked_in_at: string | null;
  notice_kind: "start" | "end" | "both" | null;
  notice_at: string | null;
};

export type HousekeepingStatus = "occupied" | "needs_cleaning" | "cleaning" | "clean";
export type OrderStatus = "pending" | "accepted" | "in_progress" | "ready" | "done" | "rejected" | "cancelled";

export const DEFAULT_REJECT_MESSAGE = "Vi kan desværre ikke levere din bestilling lige nu.";
export const HOUSEKEEPING_LABELS: Record<HousekeepingStatus, string> = {
  occupied: "Gæst på værelset",
  needs_cleaning: "Skal rengøres",
  cleaning: "I gang med rengøring",
  clean: "Rengjort",
};

export const ORDER_LABELS: Record<OrderStatus, string> = {
  pending: "Ny",
  accepted: "Accepteret",
  in_progress: "I gang",
  ready: "Klar",
  done: "Leveret",
  rejected: "Afvist",
  cancelled: "Annulleret",
};

export const nextOrderStatus = (s: OrderStatus): OrderStatus =>
  s === "pending" ? "accepted" : s === "accepted" ? "in_progress" : s === "in_progress" ? "ready" : s === "ready" ? "done" : s;

const KEY = "hotelpilot-guests";
const OLD_KEY = "hotelpilot-guest";
export type StoredRoom = { t: string; d: string; room?: string; name?: string };
type Store = { active: string | null; list: StoredRoom[] };

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
    const old = JSON.parse(localStorage.getItem(OLD_KEY) || "null") as StoredRoom | null;
    if (old?.t) return { active: old.t, list: [old] };
  } catch {
    /* ingen lagring */
  }
  return { active: null, list: [] };
}
function writeStore(st: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(st));
    localStorage.removeItem(OLD_KEY);
  } catch {
    /* ingen lagring */
  }
}

/** Gemmer værelset og gør det til det åbne. Et værelse mere kan lægges til uden at miste de andre. */
export function saveSession(s: GuestSession) {
  const st = readStore();
  const entry = { t: s.access_token, d: s.device_id, room: s.room_number, name: s.guest_name };
  writeStore({ active: s.access_token, list: [...st.list.filter((x) => x.t !== s.access_token), entry] });
}
export function loadStored(): { t: string; d: string } | null {
  const st = readStore();
  return st.list.find((x) => x.t === st.active) ?? null;
}
export function listStored(): { rooms: StoredRoom[]; active: string | null } {
  const st = readStore();
  return { rooms: st.list, active: st.active };
}
export function setActiveStored(token: string) {
  const st = readStore();
  if (st.list.some((x) => x.t === token)) writeStore({ ...st, active: token });
}
/** Fjerner det åbne værelse. Har gæsten andre værelser, bliver det næste det åbne. */
export function clearSession() {
  const st = readStore();
  const list = st.list.filter((x) => x.t !== st.active);
  writeStore({ active: list[0]?.t ?? null, list });
}

export function errorText(e: { message?: string } | null) {
  const m = e?.message ?? "";
  if (m.includes("STAY_EXPIRED")) return "Dit ophold er desværre stoppet. Gå til receptionen og tjek ud. Tak for dit ophold.";
  if (m.includes("STAY_NOT_STARTED")) return "Dit ophold er ikke startet endnu.";
  if (m.includes("ROOM_BUSY")) return "Værelset er allerede booket i det valgte tidsrum.";
  if (m.includes("ORDER_NOT_CANCELLABLE")) return "Bestillingen er allerede afsluttet eller annulleret.";
  if (m.includes("DEVICE_LIMIT")) return "Maks. antal enheder for værelset er nået.";
  if (m.includes("INVALID_LOGIN")) return "Bookingnummer eller navn er forkert. Skriv dit fulde navn, som det står på bookingen.";
  if (m.includes("NOT_CHECKED_IN")) return "Tjek ind først, så virker nøglen.";
  if (m.includes("BOOKING_NOT_FOUND")) return "Opholdet findes ikke længere.";
  if (m.includes("INVALID_STAY")) return "Sluttidspunktet skal være efter starttidspunktet.";
  if (m.includes("ROOMSERVICE_STAY_ENDING")) return "Roomservice lukker 2 timer før dit ophold slutter.";
  if (m.includes("INVALID_EXPIRY")) return "Vælg et tidspunkt i fremtiden.";
  if (m.includes("FEATURE_OFF")) return "Denne funktion er slået fra lige nu.";
  if (m.includes("NO_GUEST_IN_ROOM")) return "Der bor ingen gæst på værelset.";
  if (m.includes("INVALID_MESSAGE")) return "Skriv en besked på op til 500 tegn.";
  if (m.includes("ROOMSERVICE_CLOSED")) return "Roomservice er lukket lige nu.";
  if (m.includes("ITEM_UNAVAILABLE")) return "En af varerne er ikke tilgængelig lige nu. Opdater kurven og prøv igen.";
  if (m.includes("EMPTY_ORDER")) return "Kurven er tom.";
  if (m.includes("INVALID_ORDER")) return "Bestillingen kunne ikke gennemføres. Tjek varer og antal.";
  if (m.includes("OPEN_ORDERS")) return "Der er uafsluttede roomserviceordrer. Lever eller afvis dem, før gæsten tjekker ud.";
  if (m.includes("PAYMENT_REQUIRED")) return "Vælg, hvordan regningen er betalt, før gæsten tjekker ud.";
  if (m.includes("ALREADY_CHECKED_OUT")) return "Gæsten er allerede tjekket ud.";
  if (m.includes("BILL_CLOSED")) return "Regningen er afsluttet og kan ikke ændres.";
  if (m.includes("ITEM_VOIDED")) return "Posten er annulleret.";
  if (m.includes("NO_ACTIVE_STAY")) return "Der bor ingen gæst på værelset lige nu.";
  if (m.includes("NO_ROOM_RATE")) return "Sæt værelsets pris under Værelser først.";
  if (m.includes("ALREADY_ADDED")) return "Overnatning er allerede på regningen.";
  if (m.includes("STAY_NOT_STARTED")) return "Opholdet er ikke startet endnu.";
  if (m.includes("ORDER_CLOSED")) return "Ordren er allerede afsluttet.";
  if (m.includes("MANAGER_ONLY")) return "Kun en leder kan gøre det.";
  if (m.includes("PIN_TAKEN")) return "Koden bruges allerede. Vælg en anden.";
  if (m.includes("INVALID_PIN")) return "Koden skal være 4–8 cifre.";
  if (m.includes("INVALID_PRICE")) return "Prisen er ugyldig.";
  if (m.includes("INVALID_QTY")) return "Antal skal være mellem 1 og 999.";
  if (m.includes("INVALID_NAME")) return "Skriv et navn eller en beskrivelse.";
  if (m.includes("INVALID_OPTIONS")) return "Varianter og tilvalg skal have et navn og en gyldig pris.";
  if (m.includes("INVALID_HOURS")) return "Udfyld både fra- og til-tidspunkt, eller ingen af dem.";
  if (m.includes("INVALID_WIFI")) return "Wi-Fi skal have et navn og en kode på mindst 8 tegn.";
  if (m.includes("FORBIDDEN")) return "Ingen adgang. Log ind igen.";
  if (m.includes("CLEANING_COOLDOWN")) return "Rengøring kan bestilles 1 gang hver 12. time.";
  if (m.includes("TOWEL_COOLDOWN")) return "Du kan bestille håndklæder 1 gang hver 12. time.";
  if (m.includes("TOWEL_LIMIT")) return "Du kan højst bytte lige så mange håndklæder, som der er personer på værelset.";
  if (m.includes("STAY_NOT_ENDED")) return "Du kan give en rating, når dit ophold er slut.";
  if (m.includes("ALREADY_RATED")) return "Tak, du har allerede givet en rating.";
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

export async function guestLogin(reference: string, name: string) {
  const { data, error } = await supabase.rpc("guest_login", { _reference: reference, _name: name });
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
export async function guestCheckIn(token: string, device: string) {
  const { data, error } = await supabase.rpc("guest_check_in" as never, { _token: token, _device: device } as never);
  if (error) throw new Error(errorText(error));
  return data as unknown as GuestSession;
}

export type RatingState = { guest_name: string; room_number: string; ended: boolean; rated: boolean };
export async function guestRatingState(token: string, device: string) {
  const { data, error } = await supabase.rpc("guest_rating_state" as never, { _token: token, _device: device } as never);
  if (error) throw new Error(errorText(error));
  return data as unknown as RatingState;
}
export async function rateStay(token: string, device: string, rating: number, comment: string) {
  const { error } = await supabase.rpc("guest_rate_stay" as never, { _token: token, _device: device, _rating: rating, _comment: comment } as never);
  if (error) throw new Error(errorText(error));
}
export type Meal = "breakfast" | "lunch" | "dinner";
export const MEAL_LABELS: Record<Meal, string> = { breakfast: "Morgenmad", lunch: "Frokost", dinner: "Aftensmad" };
export const MEAL_FIELD: Record<Meal, "breakfast_choice" | "lunch_choice" | "dinner_choice"> = { breakfast: "breakfast_choice", lunch: "lunch_choice", dinner: "dinner_choice" };
