import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { detectAppMode } from "@/lib/platform";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PmsPanel } from "@/components/hotel/pms-panel";
import { OrdersBoard } from "@/components/hotel/orders-board";
import { OpsPanel } from "@/components/hotel/ops-panel";
import { StaffRequests } from "@/components/hotel/staff-requests";
import { StaffStays } from "@/components/hotel/staff-stays";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errorText, nextOrderStatus, ORDER_LABELS, type OrderStatus } from "@/lib/hotel";

export const Route = createFileRoute("/personale")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Personale — HotelPilot" },
      { name: "description", content: "Live ordrer og værelsesstatus for hotellets personale." },
      { property: "og:title", content: "Personale — HotelPilot" },
      { property: "og:description", content: "Live overblik over bestillinger og rengøring." },
    ],
  }),
  component: Staff,
});

type Order = { id: string; room_number: string; type: string; details: string; status: OrderStatus; cancelled?: boolean; created_at: string; updated_at?: string; quantity?: number };
type Room = { number: string };

function Staff() {
  const [pin, setPin] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const navigate = useNavigate();

  // Gæste-appen (installeret PWA / Capacitor) har ingen personaleadgang.
  useEffect(() => { if (detectAppMode()) navigate({ to: "/", replace: true }); }, [navigate]);

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
          <Button className="mt-4 h-auto w-full rounded-full bg-gradient-brass py-4 font-semibold text-accent-foreground">Log ind</Button>
          <Link to="/demo" className="mt-6 inline-block text-sm text-brass underline">Prøv demo (ingen data gemmes)</Link><br />
          <Link to="/" className="mt-3 inline-block text-sm opacity-70">← Til gæsteportalen</Link>
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
    const loadOrders = () => supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(50).then(({ data }) => setOrders(((data as Order[]) ?? []).map(o=>({...o,status:o.cancelled?"cancelled":o.status}))));
    const loadRooms = () => supabase.from("rooms").select("number").order("number").then(({ data }) => setRooms((data as Room[]) ?? []));
    loadOrders(); loadRooms();
    const ch = supabase.channel(`staff-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (p) => {
        const o = p.new as Order;
        toast(`Ny bestilling · Værelse ${o.room_number}`, { description: o.type === "towels" ? "Håndklæder" : o.details });
        loadOrders();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, loadOrders)
            .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function cycleOrder(o: Order) {
    const next = nextOrderStatus(o.status);
    const { error } = await supabase.rpc("staff_set_order_status", { _pin: pin, _order: o.id, _status: next });
    if (error) toast.error(errorText(error));
    else { setOrders((os) => os.map((x) => (x.id === o.id ? { ...x, status: next, updated_at: new Date().toISOString() } : x))); toast.success(`Værelse ${o.room_number}: ${ORDER_LABELS[next]}`); }
  }
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 bg-forest px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] text-forest-foreground shadow-md lg:px-8">
        <div className="flex items-baseline gap-4">
          <span className="font-display text-2xl">HotelPilot</span>
          <span className="eyebrow text-brass">Personale</span>
        </div>
        <nav aria-label="Sektioner" className="order-3 flex w-full gap-1 overflow-x-auto text-sm sm:order-none sm:w-auto">
          {[["#foresp","Rengøring"],["#ordrer","Ordrer"],["#ophold","Ophold"],["#pms","PMS"]].map(([h,l]) => <a key={h} href={h} className="whitespace-nowrap rounded-full px-3 py-1.5 text-forest-foreground/75 hover:bg-forest-foreground/10 hover:text-forest-foreground">{l}</a>)}
        </nav>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-status-clean" />Live</span>
          <Button onClick={onLogout} variant="ghost" className="opacity-70">Log ud</Button>
        </div>
      </header>

      <OpsPanel pin={pin} orders={orders} />
      <main className="space-y-8 p-6 lg:p-8">
        <div id="foresp"><StaffRequests pin={pin} /></div>
        <div id="ordrer"><OrdersBoard orders={orders} onAdvance={cycleOrder} /></div>
        <StaffStays pin={pin} />
      </main>
      <div id="pms"><PmsPanel pin={pin} rooms={rooms.map(r=>r.number)} /></div>
    </div>
  );
}
