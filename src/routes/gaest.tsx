import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  clearSession, guestJoin, guestSession, loadStored, saveSession, errorText,
  HOUSEKEEPING_LABELS, ORDER_LABELS, type GuestSession, type HousekeepingStatus, type OrderStatus,
} from "@/lib/hotel";

export const Route = createFileRoute("/gaest")({
  validateSearch: (s: Record<string, unknown>) => ({ t: typeof s["t"] === "string" ? (s["t"] as string) : undefined }),
  head: () => ({
    meta: [
      { title: "Mit værelse — HotelPilot" },
      { name: "description", content: "Digital nøgle, room service, rengøring, Wi-Fi og dagens aktiviteter." },
      { property: "og:title", content: "Mit værelse — HotelPilot" },
      { property: "og:description", content: "Din digitale concierge på hotellet." },
    ],
  }),
  component: GuestDashboard,
});

type Order = { id: string; type: string; details: string; status: OrderStatus; created_at: string };
type Event = { id: string; title: string; starts_at: string; location: string; description: string };

const MENU = ["Club sandwich", "Caesar salat", "Dagens suppe", "Pommes frites", "Flaske rødvin", "Kaffe & croissant"];

function GuestDashboard() {
  const { t } = Route.useSearch();
  const navigate = useNavigate();
  const [s, setS] = useState<GuestSession | null>(null);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [status, setStatus] = useState<HousekeepingStatus>("occupied");
  const [sheet, setSheet] = useState<null | "food" | "share" | "map">(null);

  useEffect(() => {
    (async () => {
      try {
        const stored = loadStored();
        let session: GuestSession;
        if (t && stored?.t !== t) {
          session = await guestJoin(t);
          saveSession(session);
          navigate({ to: "/gaest", search: { t: undefined }, replace: true });
        } else if (stored) {
          session = await guestSession(stored.t, stored.d);
        } else {
          navigate({ to: "/" });
          return;
        }
        setS(session);
        setStatus(session.housekeeping_status);
      } catch (e) {
        clearSession();
        setError((e as Error).message);
      }
    })();
    supabase.from("events").select("*").order("starts_at").then(({ data }) => setEvents((data as Event[]) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!s) return undefined;
    const room = s.room_number;
    const load = () =>
      supabase.from("orders").select("*").eq("room_number", room).order("created_at", { ascending: false }).limit(10)
        .then(({ data }) => setOrders((data as Order[]) ?? []));
    load();
    const ch = supabase
      .channel(`guest-${room}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `room_number=eq.${room}` }, load)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `number=eq.${room}` }, (p) =>
        setStatus((p.new as { housekeeping_status: HousekeepingStatus }).housekeeping_status))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [s]);

  async function order(type: "towels" | "room_service", details: string) {
    if (!s) return;
    const { error } = await supabase.rpc("guest_order", { _token: s.access_token, _device: s.device_id, _type: type, _details: details });
    if (error) { toast.error(errorText(error)); return; }
    toast.success(type === "towels" ? "Håndklæder er på vej" : "Din bestilling er modtaget");
  }

  async function toggleClean() {
    if (!s) return;
    const want = status !== "needs_cleaning";
    const { data, error } = await supabase.rpc("guest_set_housekeeping", { _token: s.access_token, _device: s.device_id, _requested: want });
    if (error) { toast.error(errorText(error)); return; }
    setStatus(data as HousekeepingStatus);
    if (want) toast.success("Personalet er underrettet");
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-3xl">Ingen adgang</h1>
        <p className="text-muted-foreground">{error}</p>
        <button onClick={() => navigate({ to: "/" })} className="rounded-full bg-primary px-6 py-3 text-primary-foreground">Til login</button>
      </div>
    );
  }
  if (!s) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Åbner dit værelse…</div>;

  const shareUrl = `${window.location.origin}/gaest?t=${s.access_token}`;
  const cleanOn = status === "needs_cleaning";

  return (
    <div className="mx-auto min-h-screen max-w-md pb-16">
      <header className="bg-gradient-forest px-6 pb-10 pt-8 text-forest-foreground">
        <div className="flex items-center justify-between">
          <span className="font-display text-xl">HotelPilot</span>
          <button onClick={() => { clearSession(); navigate({ to: "/" }); }} className="eyebrow text-forest-foreground/60">Log ud</button>
        </div>
        <p className="eyebrow mt-8 text-brass">Værelse {s.room_number}</p>
        <h1 className="mt-2 text-4xl">God aften, {s.guest_name.split(" ")[0]}</h1>
      </header>

      <div className="-mt-6 space-y-4 px-4">
        {/* Digital key */}
        <section className="rounded-3xl bg-card p-5 shadow-soft">
          <div className="flex items-start justify-between">
            <div>
              <p className="eyebrow text-muted-foreground">Digital nøgle</p>
              <h2 className="mt-1 text-2xl">Værelse {s.room_number}</h2>
            </div>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs">Aktiv</span>
          </div>
          <div className="mt-4 flex justify-center rounded-2xl bg-forest p-5">
            <QRCodeSVG value={`HOTELPILOT-KEY:${s.room_number}:${s.device_id}`} size={168} bgColor="transparent" fgColor="currentColor" className="text-forest-foreground" />
          </div>
          <button onClick={() => toast.promise(new Promise((r) => setTimeout(r, 1200)), { loading: "Sender oplåsningssignal…", success: `Dør ${s.room_number} er låst op`, error: "Fejl" })}
            className="mt-4 w-full rounded-full bg-gradient-brass py-4 font-semibold text-accent-foreground active:scale-[0.98]">
            Lås dør op
          </button>
        </section>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <Tile title="Bestil håndklæder" sub="Leveres inden 15 min" onClick={() => order("towels", "Friske håndklæder")} />
          <Tile title="Room service" sub="Mad & drikke" onClick={() => setSheet("food")} />
        </div>

        {/* Housekeeping */}
        <section className="flex items-center justify-between rounded-3xl bg-card p-5 shadow-soft">
          <div>
            <h3 className="text-xl">Rengør mit værelse nu</h3>
            <p className="text-sm text-muted-foreground">Status: {HOUSEKEEPING_LABELS[status]}</p>
          </div>
          <button role="switch" aria-checked={cleanOn} aria-label="Rengør mit værelse nu" onClick={toggleClean}
            className={`relative h-8 w-14 rounded-full transition ${cleanOn ? "bg-primary" : "bg-muted"}`}>
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-card shadow transition-all ${cleanOn ? "left-7" : "left-1"}`} />
          </button>
        </section>

        {orders.length > 0 && (
          <section className="rounded-3xl bg-card p-5 shadow-soft">
            <p className="eyebrow text-muted-foreground">Dine bestillinger</p>
            <ul className="mt-3 divide-y">
              {orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between py-2 text-sm">
                  <span>{o.type === "towels" ? "Håndklæder" : o.details}</span>
                  <StatusPill status={o.status} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Wifi */}
        <section className="rounded-3xl bg-gradient-forest p-5 text-forest-foreground shadow-soft">
          <p className="eyebrow text-brass">Wi-Fi</p>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div><p className="text-xs opacity-60">Netværk</p><p className="font-semibold">{s.wifi_ssid}</p></div>
            <div><p className="text-xs opacity-60">Adgangskode</p>
              <button onClick={() => { navigator.clipboard?.writeText(s.wifi_password); toast.success("Kopieret"); }} className="font-mono font-semibold">{s.wifi_password}</button>
            </div>
          </div>
        </section>

        {/* Events */}
        <section className="rounded-3xl bg-card p-5 shadow-soft">
          <p className="eyebrow text-muted-foreground">I dag på hotellet</p>
          <ul className="mt-3 space-y-3">
            {events.map((e) => (
              <li key={e.id} className="flex gap-4">
                <span className="w-12 font-display text-xl text-brass">{e.starts_at.slice(0, 5)}</span>
                <div><p className="font-semibold">{e.title}</p><p className="text-sm text-muted-foreground">{e.location} · {e.description}</p></div>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <Tile title="Hotelkort" sub="Find vej" onClick={() => setSheet("map")} />
          <Tile title="Del adgang" sub={`${s.devices}/${s.max_devices} enheder`} onClick={() => setSheet("share")} />
        </div>
      </div>

      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest/60" onClick={() => setSheet(null)}>
          <div className="w-full max-w-md rounded-t-3xl bg-card p-6 animate-in slide-in-from-bottom" onClick={(e) => e.stopPropagation()}>
            {sheet === "food" && (
              <>
                <h2 className="text-3xl">Room service</h2>
                <div className="mt-4 space-y-2">
                  {MENU.map((m) => (
                    <button key={m} onClick={() => { order("room_service", m); setSheet(null); }} className="flex w-full justify-between rounded-2xl border px-4 py-3 text-left hover:bg-secondary">
                      <span>{m}</span><span className="text-brass">Bestil</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {sheet === "share" && (
              <>
                <h2 className="text-3xl">Del adgang</h2>
                <p className="mt-1 text-sm text-muted-foreground">Medgæster kan scanne koden for at åbne værelset på deres egen telefon. Maks. {s.max_devices} enheder.</p>
                <div className="mt-4 flex justify-center rounded-2xl bg-secondary p-5"><QRCodeSVG value={shareUrl} size={180} bgColor="transparent" /></div>
                <button onClick={() => { navigator.clipboard?.writeText(shareUrl); toast.success("Link kopieret"); }} className="mt-4 w-full rounded-full bg-primary py-3 text-primary-foreground">Kopiér link</button>
              </>
            )}
            {sheet === "map" && (
              <>
                <h2 className="text-3xl">Hotelkort</h2>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  {["Taghave · 4. sal", "Bar Nord · 4. sal", "Spa · 4. sal", "Værelser 301–304", "Værelser 201–204", "Værelser 101–104", "Restaurant Lys", "Lobby & reception", "Vinkælder · K"].map((z, i) => (
                    <div key={z} className={`flex aspect-square items-center justify-center rounded-xl p-2 ${z.includes(s.room_number.slice(0, 1) + "0") ? "bg-gradient-brass text-accent-foreground" : i % 2 ? "bg-secondary" : "bg-muted"}`}>{z}</div>
                  ))}
                </div>
              </>
            )}
            <button onClick={() => setSheet(null)} className="mt-4 w-full py-2 text-sm text-muted-foreground">Luk</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ title, sub, onClick }: { title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-3xl bg-card p-5 text-left shadow-soft transition active:scale-[0.97]">
      <span className="mb-6 block h-1 w-8 rounded-full bg-gradient-brass" />
      <p className="font-display text-xl leading-tight">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </button>
  );
}

export function StatusPill({ status }: { status: OrderStatus }) {
  const cls = status === "pending" ? "bg-status-dirty/15 text-status-dirty" : status === "in_progress" ? "bg-status-cleaning/25 text-foreground" : "bg-status-clean/15 text-status-clean";
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>{ORDER_LABELS[status]}</span>;
}
