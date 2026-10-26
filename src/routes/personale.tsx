import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errorText, HOUSEKEEPING_LABELS, nextOrderStatus, ORDER_LABELS, type HousekeepingStatus, type OrderStatus } from "@/lib/hotel";

export const Route = createFileRoute("/personale")({
  head: () => ({
    meta: [
      { title: "Personale — HotelPilot" },
      { name: "description", content: "Live ordrer og værelsesstatus for hotellets personale." },
      { property: "og:title", content: "Personale — HotelPilot" },
      { property: "og:description", content: "Live overblik over bestillinger og rengøring." },
    ],
  }),
  component: Staff,
});

type Order = { id: string; room_number: string; type: string; details: string; status: OrderStatus; created_at: string };
type Room = { number: string; floor: number; housekeeping_status: HousekeepingStatus };

const ROOM_CYCLE: HousekeepingStatus[] = ["occupied", "needs_cleaning", "cleaning", "clean"];
const ROOM_CLS: Record<HousekeepingStatus, string> = {
  occupied: "border-status-occupied bg-status-occupied/10",
  needs_cleaning: "border-status-dirty bg-status-dirty/15",
  cleaning: "border-status-cleaning bg-status-cleaning/20",
  clean: "border-status-clean bg-status-clean/10",
};
const DOT: Record<HousekeepingStatus, string> = {
  occupied: "bg-status-occupied", needs_cleaning: "bg-status-dirty", cleaning: "bg-status-cleaning", clean: "bg-status-clean",
};
const ORDER_CLS: Record<OrderStatus, string> = {
  pending: "bg-status-dirty/15 text-status-dirty",
  in_progress: "bg-status-cleaning/25 text-foreground",
  done: "bg-status-clean/15 text-status-clean",
};

function Staff() {
  const [pin, setPin] = useState<string | null>(null);
  const [input, setInput] = useState("");

  useEffect(() => { setPin(sessionStorage.getItem("hp-staff")); }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    const { data } = await supabase.rpc("staff_check", { _pin: input });
    if (!data) { toast.error("Forkert personalekode"); return; }
    sessionStorage.setItem("hp-staff", input);
    setPin(input);
  }

  if (!pin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-forest px-6 text-forest-foreground">
        <form onSubmit={login} className="w-full max-w-sm text-center">
          <p className="eyebrow text-brass">HotelPilot</p>
          <h1 className="mt-2 text-4xl">Personale</h1>
          <input type="password" inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Personalekode"
            className="mt-8 w-full rounded-2xl border border-forest-foreground/20 bg-forest/60 px-4 py-4 text-center text-2xl tracking-[0.5em] outline-none" />
          <button className="mt-4 w-full rounded-full bg-gradient-brass py-4 font-semibold text-accent-foreground">Log ind</button>
          <p className="mt-4 text-xs opacity-60">Demo-kode: 1234</p>
          <Link to="/" className="mt-6 inline-block text-sm opacity-70">← Til gæsteportalen</Link>
        </form>
      </div>
    );
  }
  return <Dashboard pin={pin} onLogout={() => { sessionStorage.removeItem("hp-staff"); setPin(null); }} />;
}

function Dashboard({ pin, onLogout }: { pin: string; onLogout: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  useEffect(() => {
    const loadOrders = () => supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(50).then(({ data }) => setOrders((data as Order[]) ?? []));
    const loadRooms = () => supabase.from("rooms").select("number,floor,housekeeping_status").order("number").then(({ data }) => setRooms((data as Room[]) ?? []));
    loadOrders(); loadRooms();
    const ch = supabase.channel(`staff-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (p) => {
        const o = p.new as Order;
        toast(`Ny bestilling · Værelse ${o.room_number}`, { description: o.type === "towels" ? "Håndklæder" : o.details });
        loadOrders();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, loadOrders)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, loadRooms)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function cycleOrder(o: Order) {
    const next = nextOrderStatus(o.status);
    setOrders((os) => os.map((x) => (x.id === o.id ? { ...x, status: next } : x)));
    const { error } = await supabase.rpc("staff_set_order_status", { _pin: pin, _order: o.id, _status: next });
    if (error) toast.error(errorText(error));
  }
  async function cycleRoom(r: Room) {
    const next: HousekeepingStatus = ROOM_CYCLE[(ROOM_CYCLE.indexOf(r.housekeeping_status) + 1) % ROOM_CYCLE.length] ?? "occupied";
    setRooms((rs) => rs.map((x) => (x.number === r.number ? { ...x, housekeeping_status: next } : x)));
    const { error } = await supabase.rpc("staff_set_room_status", { _pin: pin, _room: r.number, _status: next });
    if (error) toast.error(errorText(error));
  }

  const open = orders.filter((o) => o.status !== "done").length;
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => b - a);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between bg-gradient-forest px-8 py-5 text-forest-foreground">
        <div className="flex items-baseline gap-4">
          <span className="font-display text-2xl">HotelPilot</span>
          <span className="eyebrow text-brass">Personale</span>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <span className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-status-clean" />Live</span>
          <button onClick={onLogout} className="opacity-70">Log ud</button>
        </div>
      </header>

      <main className="grid gap-6 p-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:p-8">
        <section className="rounded-3xl bg-card p-6 shadow-soft">
          <div className="flex items-baseline justify-between">
            <h2 className="text-3xl">Live ordrer</h2>
            <span className="text-sm text-muted-foreground">{open} åbne</span>
          </div>
          <ul className="mt-4 space-y-2">
            {orders.map((o) => (
              <li key={o.id} className="flex items-center gap-4 rounded-2xl border px-4 py-3">
                <span className="w-14 font-display text-2xl">{o.room_number}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{o.type === "towels" ? "Håndklæder" : "Room service"}</p>
                  <p className="truncate text-sm text-muted-foreground">{o.details} · {new Date(o.created_at).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <button onClick={() => cycleOrder(o)} className={`rounded-full px-3 py-1 text-xs font-semibold ${ORDER_CLS[o.status]}`}>{ORDER_LABELS[o.status]}</button>
              </li>
            ))}
            {orders.length === 0 && <li className="py-8 text-center text-muted-foreground">Ingen bestillinger endnu</li>}
          </ul>
        </section>

        <section className="rounded-3xl bg-card p-6 shadow-soft">
          <h2 className="text-3xl">Værelsesstatus</h2>
          <div className="mt-3 flex flex-wrap gap-4 text-xs">
            {ROOM_CYCLE.map((s) => (
              <span key={s} className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${DOT[s]}`} />{HOUSEKEEPING_LABELS[s]} ({rooms.filter((r) => r.housekeeping_status === s).length})</span>
            ))}
          </div>
          <div className="mt-5 space-y-4">
            {floors.map((f) => (
              <div key={f}>
                <p className="eyebrow mb-2 text-muted-foreground">{f}. sal</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {rooms.filter((r) => r.floor === f).map((r) => (
                    <button key={r.number} onClick={() => cycleRoom(r)} className={`rounded-2xl border-2 p-4 text-left transition hover:scale-[1.02] ${ROOM_CLS[r.housekeeping_status]}`}>
                      <p className="font-display text-3xl">{r.number}</p>
                      <p className="mt-1 text-xs font-semibold">{HOUSEKEEPING_LABELS[r.housekeeping_status]}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
