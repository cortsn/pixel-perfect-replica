import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, KeyRound, Leaf, Minus, Plus, ShoppingBasket, Sparkles, Star, Utensils, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrdersBoard, type BoardOrder } from "@/components/hotel/orders-board";
import { nextOrderStatus, ORDER_LABELS } from "@/lib/hotel";
import { dinnerStats, purchaseSuggestions, towelsLeft } from "@/lib/ops";
import { RoomService } from "@/components/hotel/room-service";
import { HotelModal } from "@/components/hotel/modal";
import { StaffRequestsView } from "@/components/hotel/staff-requests";
import { CleaningForm, CleaningStatusNote } from "@/components/hotel/guest-requests";
import { CheckInScreen, StayControlsView, StayEndTimer, StayNotice, WaitingScreen, type StayRow } from "@/components/hotel/stay";
import { CLEANING_LABELS, type CleaningRequest, type CleaningStatus } from "@/lib/cleaning";

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
// Tidspunkterne beregnes først i browseren, så "forsinket" passer til, hvornår siden åbnes.
const sampleOrders = (): BoardOrder[] => {
  const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();
  return [
  { id: "1", room_number: "101", type: "room_service", details: "Club sandwich", status: "pending", created_at: ago(14), updated_at: ago(14) },
  { id: "2", room_number: "204", type: "towels", details: "2 håndklæder til bytte", status: "pending", created_at: ago(3), updated_at: ago(3), quantity: 2 },
  { id: "3", room_number: "302", type: "room_service", details: "Flaske rødvin", status: "in_progress", created_at: ago(8), updated_at: ago(8) },
  { id: "4", room_number: "103", type: "room_service", details: "Kaffe & croissant", status: "ready", created_at: ago(20), updated_at: ago(2) },
  { id: "5", room_number: "201", type: "towels", details: "1 håndklæder til bytte", status: "done", created_at: ago(90), updated_at: ago(60), quantity: 1 },
  ];
};
const SAMPLE_BOOKINGS = [
  { guests: 2, dinner_choice: "hotel" }, { guests: 2, dinner_choice: "hotel" }, { guests: 3, dinner_choice: "out" },
  { guests: 1, dinner_choice: null }, { guests: 2, dinner_choice: "hotel" },
];
const sampleCleaning = (): CleaningRequest[] => {
  const at = (min: number) => new Date(Date.now() + min * 60000).toISOString();
  return [
    { id: "c1", room_number: "204", guest_name: "Maria Holm", wants_towels: true, away_from: at(-60), away_until: at(40), status: "requested", is_repeat: false, created_at: at(-30) },
    { id: "c2", room_number: "302", guest_name: "Peter Dahl", wants_towels: false, away_from: null, away_until: null, status: "requested", is_repeat: true, created_at: at(-10) },
    { id: "c3", room_number: "103", guest_name: "Sofie Berg", wants_towels: true, away_from: at(-20), away_until: at(180), status: "in_progress", is_repeat: false, created_at: at(-45) },
  ];
};

type DemoStay = StayRow & { notice: "start" | "end" | "both" | null; noticeAt: number };
type DemoState = {
  stays: DemoStay[]; setStays: React.Dispatch<React.SetStateAction<DemoStay[]>>;
  cleaning: CleaningRequest[]; setCleaning: React.Dispatch<React.SetStateAction<CleaningRequest[]>>;
  now: number;
};
const sampleStays = (): DemoStay[] => {
  const at = (min: number) => new Date(Date.now() + min * 60000).toISOString();
  const base = { notice: null, noticeAt: 0 } as const;
  return [
    { id: "mine", reference: "HP-1001", room_number: "101", guest_name: "Anna Nielsen (dig)", guests: 2, starts_at: at(1.5), ends_at: at(26 * 60), checked_in_at: null, ...base },
    { id: "s2", reference: "HP-1002", room_number: "204", guest_name: "Maria Holm", guests: 2, starts_at: at(-300), ends_at: at(20 * 60), checked_in_at: at(-290), ...base },
    { id: "s3", reference: "HP-1003", room_number: "305", guest_name: "Jens Aaby", guests: 1, starts_at: at(180), ends_at: at(2000), checked_in_at: null, ...base },
  ];
};

function Demo() {
  const [view, setView] = useState<"guest" | "staff">("guest");
  const [stays, setStays] = useState<DemoStay[]>([]);
  const [cleaning, setCleaning] = useState<CleaningRequest[]>([]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setStays(sampleStays()); setCleaning(sampleCleaning()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const st: DemoState = { stays, setStays, cleaning, setCleaning, now };
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
      {view === "staff" ? <StaffDemo st={st} /> : <GuestDemo st={st} />}
    </div>
  );
}

function StaffDemo({ st }: { st: DemoState }) {
  const [orders, setOrders] = useState<BoardOrder[]>([]);
  const now = st.now;
  useEffect(() => { setOrders(sampleOrders()); }, []);
  const d = dinnerStats(SAMPLE_BOOKINGS);
  const buy = purchaseSuggestions([
    { type: "room_service", details: "Club sandwich" }, { type: "room_service", details: "Club sandwich" },
    { type: "room_service", details: "Kaffe & croissant" }, { type: "towels", details: "", quantity: 3 },
  ]);
  return (
    <div>
      <nav aria-label="Sektioner" className="sticky top-0 z-40 flex gap-1 overflow-x-auto bg-forest px-4 py-2 text-sm text-forest-foreground shadow-md lg:px-8">
        {[["#overblik", "Overblik"], ["#foresp", "Rengøring"], ["#ordrer", "Ordrer"], ["#ophold", "Ophold"]].map(([h, l]) => <a key={h} href={h} className="whitespace-nowrap rounded-full px-3 py-1.5 text-forest-foreground/75 hover:bg-forest-foreground/10 hover:text-forest-foreground">{l}</a>)}
      </nav>
      <section id="overblik" className="grid gap-4 border-b px-6 py-6 md:grid-cols-3 lg:px-8">
        <article className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="flex items-center gap-2 text-sm font-semibold"><Leaf className="h-4 w-4 text-primary" />Mindske madspild</p>
          <p className="mt-3 flex items-baseline gap-2 font-display text-5xl leading-none">{d.eating}<span className="text-2xl text-muted-foreground">/ {d.total}</span></p>
          <p className="mt-1 text-sm text-muted-foreground">gæster spiser på hotellet i aften</p>
          <progress aria-label="Andel der spiser på hotellet" value={d.pct} max={100} className="hotel-progress mt-3 h-2 w-full" />
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Utensils className="h-3 w-3" />Forventet mad: ca. {d.kg} kg · {d.unanswered} har ikke svaret</p>
        </article>
        <article className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="flex items-center gap-2 text-sm font-semibold"><ShoppingBasket className="h-4 w-4 text-primary" />Indkøbsforslag (7 dage)</p>
          <ul className="mt-3 space-y-1 text-sm">{buy.map(b => <li key={b.item} className="flex justify-between gap-3"><span>{b.item}</span><span className="text-muted-foreground">køb ca. {b.suggest}</span></li>)}</ul>
        </article>
        <article className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="flex items-center gap-2 text-sm font-semibold"><Star className="h-4 w-4 text-primary" />Gæsteanmeldelser · 4.5/5</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><span className="font-semibold">Værelse 201 · ★★★★★</span><p className="text-muted-foreground">Dejligt ophold, nem service.</p></li>
            <li><span className="font-semibold">Værelse 302 · ★★★★</span><p className="text-muted-foreground">Lidt ventetid på room service.</p></li>
          </ul>
        </article>
      </section>
      <main className="space-y-8 p-6 lg:p-8">
        <div id="foresp">
          <StaffRequestsView requests={st.cleaning} now={now} busy={null}
            onCleaning={(r, status: Exclude<CleaningStatus, "requested">) => {
              st.setCleaning(l => l.map(x => x.id === r.id ? { ...x, status } : x));
              toast(`Demo: værelse ${r.room_number} → ${CLEANING_LABELS[status]} (ikke gemt)`);
            }}
          />
        </div>
        <div id="ordrer"><OrdersBoard orders={orders} onAdvance={(o) => {
          const next = nextOrderStatus(o.status);
          setOrders(os => os.map(x => x.id === o.id ? { ...x, status: next, updated_at: new Date().toISOString() } : x));
          toast(`Demo: værelse ${o.room_number} → ${ORDER_LABELS[next]} (ikke gemt)`);
        }} /></div>
        <StayControlsView stays={st.stays} now={now} busy={null} onChange={(s, starts, ends) => {
          const startChanged = starts.toISOString() !== s.starts_at, endChanged = ends.toISOString() !== s.ends_at;
          st.setStays(l => l.map(x => x.id === s.id ? { ...x, starts_at: starts.toISOString(), ends_at: ends.toISOString(), notice: startChanged && endChanged ? "both" : startChanged ? "start" : "end", noticeAt: Date.now() } : x));
          toast(`Demo: værelse ${s.room_number} – tiden er ændret, gæsten får besked (ikke gemt)`);
        }} />
      </main>
    </div>
  );
}

function GuestDemo({ st }: { st: DemoState }) {
  const limit = 2;
  const me = st.stays.find(x => x.id === "mine");
  const [used, setUsed] = useState(0);
  const [dinner, setDinner] = useState<"hotel" | "out" | null>(null);
  const [qty, setQty] = useState(1);
  const [sheet, setSheet] = useState<"clean" | null>(null);
  const [seen, setSeen] = useState(0);
  const left = towelsLeft(limit, used);
  const q = Math.min(qty, Math.max(left, 1));
  const mine = [...st.cleaning].filter(c => c.room_number === "101").sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  const mineOpen = mine && (mine.status === "requested" || mine.status === "in_progress");
  const card = "rounded-2xl border bg-card p-5 shadow-sm";
  if (!me) return null;
  const notice = me.notice && me.noticeAt > seen ? <StayNotice kind={me.notice} startsAt={me.starts_at} endsAt={me.ends_at} onDismiss={() => setSeen(me.noticeAt)} /> : null;
  const resetTimes = () => st.setStays(l => l.map(x => x.id === "mine" ? { ...x, starts_at: new Date(Date.now() + 90000).toISOString(), checked_in_at: null, notice: null } : x));
  if (st.now < Date.parse(me.starts_at)) return <WaitingScreen name="Anna" startsAt={me.starts_at} clock={st.now} notice={notice} onLogout={resetTimes} />;
  if (!me.checked_in_at) return <CheckInScreen name="Anna" room="101" notice={notice} onLogout={resetTimes} onCheckIn={() => { st.setStays(l => l.map(x => x.id === "mine" ? { ...x, checked_in_at: new Date().toISOString() } : x)); toast("Du er tjekket ind. Velkommen!"); }} />;
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 pb-28">
      <header className="-mx-4 rounded-b-3xl bg-gradient-forest px-6 pb-8 pt-7 text-forest-foreground">
        <span className="font-display text-2xl">HotelPilot</span>
        <p className="eyebrow mt-7 text-brass">Værelse 101</p>
        <h1 className="mt-2 text-4xl">Velkommen, Anna</h1>
      </header>
      {notice}
      <section id="noegle" className={card}>
        <div className="flex items-center justify-between"><h2 className="text-3xl">Digital nøgle</h2><span className="flex items-center gap-1 text-xs text-status-clean"><Check className="h-4 w-4" />Aktiv</span></div>
        <Button className="mt-5 h-16 w-full rounded-full bg-gradient-brass text-lg font-semibold text-accent-foreground shadow-soft" onClick={() => toast("Demo: dør ikke tilsluttet")}><KeyRound className="!h-6 !w-6" />Lås dør op</Button>
      </section>
      <section className={card}>
        <h2 className="flex items-center gap-2 text-2xl"><Leaf className="h-5 w-5 text-primary" />Spiser du på hotellet i aften?</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(["hotel", "out"] as const).map(c => <Button key={c} variant={dinner === c ? "default" : "outline"} onClick={() => setDinner(d => (d === c ? null : c))}>{c === "hotel" ? "På hotellet" : "Ude i aften"}</Button>)}
        </div>
      </section>
      <section id="service" className={card}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xl"><Sparkles className="h-4 w-4 text-brass" />Håndklæder</h2>
          <span className="text-xs text-muted-foreground">{left} tilbage</span>
        </div>
        {left > 0 ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" aria-label="Færre" disabled={q <= 1} onClick={() => setQty(q - 1)}><Minus /></Button>
              <span className="w-6 text-center text-xl font-semibold tabular-nums">{q}</span>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" aria-label="Flere" disabled={q >= left} onClick={() => setQty(q + 1)}><Plus /></Button>
            </div>
            <Button onClick={() => { setUsed(u => u + q); setQty(1); toast("Demo: bestilling ikke gemt"); }}>Bestil</Button>
          </div>
        ) : <p className="mt-3 rounded-md border p-3 text-sm">Alle håndklæder er bestilt. Kontakt receptionen for flere.</p>}
      </section>
      <section id="rengoering" className={card}>
        <h2 className="flex items-center gap-2 text-2xl"><Sparkles className="h-5 w-5 text-brass" />Rengøring</h2>
        <p className="mt-1 text-sm text-muted-foreground">Vælg om du vil have rengøring, og hvornår det passer.</p>
        <CleaningStatusNote req={mine} />
        {!mineOpen && <Button className="mt-4 h-12 w-full" variant="outline" onClick={() => setSheet("clean")}>{mine?.status === "not_reached" ? "Bestil rengøring igen" : "Bestil rengøring"}</Button>}
      </section>
      <section id="roomservice" className={card}>
        <h2 className="flex items-center gap-2 text-2xl"><Utensils className="h-5 w-5 text-brass" />Room service</h2>
        <div className="mt-3 space-y-3"><RoomService room="101" onSubmit={(d) => toast(`Demo: ${d} — ikke sendt til køkkenet`)} /></div>
      </section>
      <section id="wifi" className="rounded-2xl bg-gradient-forest p-5 text-forest-foreground">
        <div className="flex items-center gap-2"><Wifi className="h-5 w-5 text-brass" /><h2 className="text-2xl">Wi-Fi</h2></div>
        <p className="mt-2 text-sm opacity-80">Netværk og kode vises her, når du er logget ind som rigtig gæst.</p>
      </section>
      <StayEndTimer endsAt={me.ends_at} clock={st.now} />
      <nav aria-label="Genveje" className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur">
        <ul className="mx-auto grid max-w-md grid-cols-4 px-2">
          {([["#noegle", "Nøgle", KeyRound], ["#service", "Håndklæder", Sparkles], ["#rengoering", "Rengøring", Sparkles], ["#roomservice", "Mad", Utensils]] as const).map(([h, l, I]) => (
            <li key={h}><a href={h} className="flex flex-col items-center gap-1 py-2.5 text-xs font-medium text-muted-foreground hover:text-primary"><I className="h-5 w-5" />{l}</a></li>
          ))}
        </ul>
      </nav>
      {sheet === "clean" && <HotelModal title="Bestil rengøring" onClose={() => setSheet(null)}>
        <CleaningForm room="101" onSubmit={(towels, from, until) => {
          const repeat = mine?.status === "not_reached";
          st.setCleaning(l => [...l, { id: `c${Date.now()}`, room_number: "101", guest_name: "Anna (dig)", wants_towels: towels, away_from: from ? from.toISOString() : null, away_until: until ? until.toISOString() : null, status: "requested", is_repeat: repeat, created_at: new Date().toISOString() }]);
          setSheet(null); toast("Demo: personalet kan se den under Personale (ikke gemt)");
        }} />
      </HotelModal>}
    </div>
  );
}
