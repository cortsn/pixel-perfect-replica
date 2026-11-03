import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Check, KeyRound, Leaf, Minus, Plus, ShoppingBasket, Sparkles, Star, Utensils, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrdersBoard, type BoardOrder } from "@/components/hotel/orders-board";
import { HOUSEKEEPING_LABELS, nextOrderStatus, ORDER_LABELS, type HousekeepingStatus } from "@/lib/hotel";
import { dinnerStats, purchaseSuggestions, towelsLeft } from "@/lib/ops";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Demo — HotelPilot" },
      { name: "description", content: "Se og afprøv HotelPilot med eksempeldata. Intet gemmes." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Demo,
});

// Alt på denne side er faste eksempeldata i browseren. Der er ingen kald til databasen,
// så intet kan oprettes, gemmes eller ændres, og alt nulstilles ved genindlæsning.
const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();
const SAMPLE_ORDERS: BoardOrder[] = [
  { id: "1", room_number: "101", type: "room_service", details: "Club sandwich", status: "pending", created_at: ago(14), updated_at: ago(14) },
  { id: "2", room_number: "204", type: "towels", details: "2 håndklæder til bytte", status: "pending", created_at: ago(3), updated_at: ago(3), quantity: 2 },
  { id: "3", room_number: "302", type: "room_service", details: "Flaske rødvin", status: "in_progress", created_at: ago(8), updated_at: ago(8) },
  { id: "4", room_number: "103", type: "room_service", details: "Kaffe & croissant", status: "ready", created_at: ago(20), updated_at: ago(2) },
  { id: "5", room_number: "201", type: "towels", details: "1 håndklæder til bytte", status: "done", created_at: ago(90), updated_at: ago(60), quantity: 1 },
];
const SAMPLE_BOOKINGS = [
  { guests: 2, dinner_choice: "hotel" }, { guests: 2, dinner_choice: "hotel" }, { guests: 3, dinner_choice: "out" },
  { guests: 1, dinner_choice: null }, { guests: 2, dinner_choice: "hotel" },
];
const SAMPLE_ROOMS: { n: string; s: HousekeepingStatus }[] = [
  { n: "301", s: "clean" }, { n: "302", s: "occupied" }, { n: "303", s: "needs_cleaning" }, { n: "304", s: "occupied" },
  { n: "201", s: "occupied" }, { n: "202", s: "cleaning" }, { n: "203", s: "clean" }, { n: "204", s: "occupied" },
];
const ROOM_CLS: Record<HousekeepingStatus, string> = {
  occupied: "border-status-occupied bg-status-occupied/10", needs_cleaning: "border-status-dirty bg-status-dirty/15",
  cleaning: "border-status-cleaning bg-status-cleaning/20", clean: "border-status-clean bg-status-clean/10",
};
const MENU = ["Club sandwich", "Caesar salat", "Dagens suppe", "Kaffe & croissant"];

function Demo() {
  const [view, setView] = useState<"guest" | "staff">("staff");
  return (
    <div className="min-h-screen">
      <div className="bg-brass px-4 py-2 text-center text-sm font-semibold text-accent-foreground">
        DEMO — eksempeldata. Intet gemmes, og alt nulstilles, når du genindlæser siden.
      </div>
      <nav className="flex items-center justify-center gap-2 border-b p-3">
        <Button variant={view === "staff" ? "default" : "outline"} onClick={() => setView("staff")}>Personale</Button>
        <Button variant={view === "guest" ? "default" : "outline"} onClick={() => setView("guest")}>Gæst</Button>
        <Link to="/" className="ml-4 text-sm text-muted-foreground underline">Til forsiden</Link>
      </nav>
      {view === "staff" ? <StaffDemo /> : <GuestDemo />}
    </div>
  );
}

function StaffDemo() {
  const [orders, setOrders] = useState(SAMPLE_ORDERS);
  const d = dinnerStats(SAMPLE_BOOKINGS);
  const buy = purchaseSuggestions([
    { type: "room_service", details: "Club sandwich" }, { type: "room_service", details: "Club sandwich" },
    { type: "room_service", details: "Kaffe & croissant" }, { type: "towels", details: "", quantity: 3 },
  ]);
  return (
    <div>
      <section className="grid gap-4 border-b px-6 py-6 md:grid-cols-3 lg:px-8">
        <article className="rounded-lg border bg-card p-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><Leaf className="h-4 w-4 text-primary" />Mindske madspild</p>
          <p className="mt-3 flex items-baseline gap-2 font-display text-5xl leading-none">{d.eating}<span className="text-2xl text-muted-foreground">/ {d.total}</span></p>
          <p className="mt-1 text-sm text-muted-foreground">gæster spiser på hotellet i aften</p>
          <progress aria-label="Andel der spiser på hotellet" value={d.pct} max={100} className="hotel-progress mt-3 h-2 w-full" />
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Utensils className="h-3 w-3" />Forventet mad: ca. {d.kg} kg · {d.unanswered} har ikke svaret</p>
        </article>
        <article className="rounded-lg border bg-card p-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><ShoppingBasket className="h-4 w-4 text-primary" />Indkøbsforslag (7 dage)</p>
          <ul className="mt-3 space-y-1 text-sm">{buy.map(b => <li key={b.item} className="flex justify-between gap-3"><span>{b.item}</span><span className="text-muted-foreground">køb ca. {b.suggest}</span></li>)}</ul>
        </article>
        <article className="rounded-lg border bg-card p-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><Star className="h-4 w-4 text-primary" />Gæsteanmeldelser · 4.5/5</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><span className="font-semibold">Værelse 201 · ★★★★★</span><p className="text-muted-foreground">Dejligt ophold, nem service.</p></li>
            <li><span className="font-semibold">Værelse 302 · ★★★★</span><p className="text-muted-foreground">Lidt ventetid på room service.</p></li>
          </ul>
        </article>
      </section>
      <main className="space-y-8 p-6 lg:p-8">
        <OrdersBoard orders={orders} onAdvance={(o) => {
          const next = nextOrderStatus(o.status);
          setOrders(os => os.map(x => x.id === o.id ? { ...x, status: next, updated_at: new Date().toISOString() } : x));
          toast(`Demo: værelse ${o.room_number} → ${ORDER_LABELS[next]} (ikke gemt)`);
        }} />
        <section>
          <h2 className="text-3xl">Værelsesstatus</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SAMPLE_ROOMS.map(r => (
              <div key={r.n} className={`rounded-lg border-2 p-3 ${ROOM_CLS[r.s]}`}>
                <p className="font-display text-3xl">{r.n}</p>
                <p className="mt-1 text-xs font-semibold">{HOUSEKEEPING_LABELS[r.s]}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function GuestDemo() {
  const limit = 2;
  const [used, setUsed] = useState(0);
  const [dinner, setDinner] = useState<"hotel" | "out" | null>(null);
  const [qty, setQty] = useState(1);
  const left = towelsLeft(limit, used);
  return (
    <div className="mx-auto max-w-md space-y-5 px-5 pb-10">
      <header className="-mx-5 bg-gradient-forest px-6 pb-7 pt-7 text-forest-foreground">
        <span className="font-display text-2xl">HotelPilot</span>
        <p className="eyebrow mt-7 text-brass">Værelse 101</p>
        <h1 className="mt-2 text-4xl">Velkommen, Anna</h1>
      </header>
      <section className="border-b pb-5">
        <div className="flex items-center justify-between"><h2 className="text-3xl">Digital nøgle</h2><span className="flex items-center gap-1 text-xs text-status-clean"><Check className="h-4 w-4" />Aktiv</span></div>
        <Button className="mt-3 bg-gradient-brass text-accent-foreground" onClick={() => toast("Demo: dør ikke tilsluttet")}><KeyRound />Lås dør op</Button>
      </section>
      <section className="border-b pb-5">
        <h2 className="flex items-center gap-2 text-2xl"><Leaf className="h-5 w-5 text-primary" />Spiser du på hotellet i aften?</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(["hotel", "out"] as const).map(c => <Button key={c} variant={dinner === c ? "default" : "outline"} onClick={() => setDinner(c)}>{c === "hotel" ? "På hotellet" : "Ude i aften"}</Button>)}
        </div>
      </section>
      <section className="border-b pb-5">
        <h2 className="flex items-center gap-2 text-2xl"><Sparkles className="h-5 w-5 text-brass" />Håndklæder</h2>
        <p className="mt-1 text-sm text-muted-foreground">Du kan bestille {left} mere ({used} af {limit} brugt).</p>
        {left > 0 ? (
          <div className="mt-3 flex items-center gap-3">
            <Button variant="outline" size="icon" aria-label="Færre" disabled={qty <= 1} onClick={() => setQty(q => q - 1)}><Minus /></Button>
            <span className="w-10 text-center text-xl">{Math.min(qty, left)}</span>
            <Button variant="outline" size="icon" aria-label="Flere" disabled={qty >= left} onClick={() => setQty(q => q + 1)}><Plus /></Button>
            <Button onClick={() => { setUsed(u => u + Math.min(qty, left)); setQty(1); toast("Demo: bestilling ikke gemt"); }}>Bestil</Button>
          </div>
        ) : <p className="mt-3 rounded-md border p-3 text-sm">Alle håndklæder er bestilt. Kontakt receptionen for flere.</p>}
      </section>
      <section className="border-b pb-5">
        <h2 className="flex items-center gap-2 text-2xl"><Utensils className="h-5 w-5 text-brass" />Room service</h2>
        <div className="mt-3 space-y-2">{MENU.map(m => <Button key={m} variant="outline" className="w-full justify-between" onClick={() => toast(`Demo: ${m} — ikke sendt til køkkenet`)}>{m}</Button>)}</div>
      </section>
      <section className="rounded-lg bg-gradient-forest p-5 text-forest-foreground">
        <div className="flex items-center gap-2"><Wifi className="h-5 w-5 text-brass" /><h2 className="text-2xl">Wi-Fi</h2></div>
        <p className="mt-2 text-sm opacity-80">Netværk og kode vises her, når du er logget ind som rigtig gæst.</p>
      </section>
    </div>
  );
}
