import { Logo } from "@/components/hotel/logo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Check, ChevronDown, DoorOpen, KeyRound, Leaf, Minus, Plus, QrCode, ShoppingBasket, Share2, ShowerHead, Sparkles, Star, Utensils, Wifi } from "lucide-react";
import { PageCard, SettingsGroup, SettingsRow, SubPage } from "@/components/hotel/settings-ui";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { shareLink } from "@/lib/share";
import { TOWEL_COOLDOWN_MS, hm } from "@/lib/stay";
import { OrdersBoard, type BoardOrder } from "@/components/hotel/orders-board";
import { nextOrderStatus, ORDER_LABELS, type Meal } from "@/lib/hotel";
import { mealStats, purchaseSuggestions } from "@/lib/ops";
import { MealsOverview } from "@/components/hotel/meals-overview";
import { MealsForm } from "@/components/hotel/meals";
import { RatingForm } from "@/components/hotel/rating";
import { RoomSwitcher } from "@/components/hotel/room-switcher";
import { RoomService } from "@/components/hotel/room-service";
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
  { guests: 2, breakfast_choice: "hotel", lunch_choice: null, dinner_choice: "hotel" }, { guests: 2, breakfast_choice: "hotel", lunch_choice: "out", dinner_choice: "hotel" },
  { guests: 3, breakfast_choice: "out", lunch_choice: "hotel", dinner_choice: "out" }, { guests: 1, breakfast_choice: null, lunch_choice: null, dinner_choice: null },
];
const sampleCleaning = (): CleaningRequest[] => {
  const at = (min: number) => new Date(Date.now() + min * 60000).toISOString();
  return [
    { id: "c1", room_number: "204", guest_name: "Maria Holm", wants_towels: true, towel_count: 2, away_from: at(-60), away_until: at(40), status: "requested", is_repeat: false, created_at: at(-30) },
    { id: "c2", room_number: "302", guest_name: "Peter Dahl", wants_towels: false, towel_count: 0, away_from: null, away_until: null, status: "requested", is_repeat: true, created_at: at(-10) },
    { id: "c3", room_number: "103", guest_name: "Sofie Berg", wants_towels: true, towel_count: 1, away_from: at(-20), away_until: at(180), status: "in_progress", is_repeat: false, created_at: at(-45) },
  ];
};

type DemoStay = StayRow & { notice: "start" | "end" | "both" | null; noticeAt: number };
type DemoState = {
  stays: DemoStay[]; setStays: React.Dispatch<React.SetStateAction<DemoStay[]>>;
  cleaning: CleaningRequest[]; setCleaning: React.Dispatch<React.SetStateAction<CleaningRequest[]>>;
  now: number;
  meals: Record<Meal, "hotel" | "out" | null>; setMeals: React.Dispatch<React.SetStateAction<Record<Meal, "hotel" | "out" | null>>>;
  ratings: { room: string; rating: number; comment: string }[]; setRatings: React.Dispatch<React.SetStateAction<{ room: string; rating: number; comment: string }[]>>;
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
  const [meals, setMeals] = useState<Record<Meal, "hotel" | "out" | null>>({ breakfast: null, lunch: null, dinner: null });
  const [ratings, setRatings] = useState([{ room: "201", rating: 5, comment: "Dejligt ophold, nem service." }, { room: "302", rating: 4, comment: "Lidt ventetid på room service." }]);
  // Måltidsvalg nulstilles hver nat kl. 00.
  const day = new Date(now).toDateString();
  const lastDay = useRef(day);
  useEffect(() => { if (lastDay.current !== day) { lastDay.current = day; setMeals({ breakfast: null, lunch: null, dinner: null }); } }, [day]);
  useEffect(() => { setStays(sampleStays()); setCleaning(sampleCleaning()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const st: DemoState = { stays, setStays, cleaning, setCleaning, now, meals, setMeals, ratings, setRatings };
  return (
    <div className="min-h-screen">
      <div className="bg-brass px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] text-center text-sm font-semibold text-accent-foreground">
        DEMO — eksempeldata. Intet gemmes, og alt nulstilles, når du genindlæser siden.
      </div>
      <nav className="flex flex-wrap items-center justify-center gap-2 border-b p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1" aria-label="Skift visning">{view === "staff" ? "Personale" : "Gæst"}<ChevronDown className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => setView("guest")}>{view === "guest" && <Check className="h-4 w-4" />}Gæst</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setView("staff")}>{view === "staff" && <Check className="h-4 w-4" />}Personale</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="sm" onClick={() => setStays(l => l.map(x => x.id === "mine" ? { ...x, ends_at: new Date().toISOString(), checked_in_at: x.checked_in_at ?? new Date().toISOString() } : x))}>Afslut gæstens ophold (demo)</Button>
        <Link to="/" className="ml-2 text-sm text-muted-foreground underline">Til forsiden</Link>
      </nav>
      {view === "staff" ? <StaffDemo st={st} /> : <GuestDemo st={st} />}
    </div>
  );
}

function StaffDemo({ st }: { st: DemoState }) {
  const [orders, setOrders] = useState<BoardOrder[]>([]);
  const now = st.now;
  useEffect(() => { setOrders(sampleOrders()); }, []);
  const ms = mealStats([...SAMPLE_BOOKINGS, { guests: 2, breakfast_choice: st.meals.breakfast, lunch_choice: st.meals.lunch, dinner_choice: st.meals.dinner }]);
  const avg = Math.round((st.ratings.reduce((a, r) => a + r.rating, 0) / st.ratings.length) * 10) / 10;
  const buy = purchaseSuggestions([
    { type: "room_service", details: "Club sandwich" }, { type: "room_service", details: "Club sandwich" },
    { type: "room_service", details: "Kaffe & croissant" }, { type: "towels", details: "", quantity: 3 },
  ]);
  return (
    <div>
      <nav aria-label="Sektioner" className="sticky top-0 z-40 flex gap-1 overflow-x-auto bg-forest px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] text-sm text-forest-foreground shadow-md lg:px-8">
        {[["#overblik", "Overblik"], ["#foresp", "Rengøring"], ["#ordrer", "Ordrer"], ["#ophold", "Ophold"]].map(([h, l]) => <a key={h} href={h} className="whitespace-nowrap rounded-full px-3 py-1.5 text-forest-foreground/75 hover:bg-forest-foreground/10 hover:text-forest-foreground">{l}</a>)}
      </nav>
      <section id="overblik" className="grid gap-4 border-b px-6 py-6 md:grid-cols-3 lg:px-8">
        <MealsOverview stats={ms} />
        <article className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="flex items-center gap-2 text-sm font-semibold"><ShoppingBasket className="h-4 w-4 text-primary" />Indkøbsforslag (7 dage)</p>
          <ul className="mt-3 space-y-1 text-sm">{buy.map(b => <li key={b.item} className="flex justify-between gap-3"><span>{b.item}</span><span className="text-muted-foreground">køb ca. {b.suggest}</span></li>)}</ul>
        </article>
        <article className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="flex items-center gap-2 text-sm font-semibold"><Star className="h-4 w-4 text-primary" />Gæsteanmeldelser · {avg}/5</p>
          <ul className="mt-3 space-y-2 text-sm">{[...st.ratings].reverse().slice(0, 3).map((r, i) => <li key={i}><span className="font-semibold">Værelse {r.room} · {"★".repeat(r.rating)}</span>{r.comment && <p className="text-muted-foreground">{r.comment}</p>}</li>)}</ul>
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
  const guests = 2;
  const me = st.stays.find(x => x.id === "mine");
  const [qty, setQty] = useState(1);
  const [towelAt, setTowelAt] = useState<number | null>(null);
  const towelWait = towelAt && towelAt + TOWEL_COOLDOWN_MS > st.now ? towelAt + TOWEL_COOLDOWN_MS : null;
  const [sheet, setSheet] = useState<"towels" | "clean" | "food" | "meals" | "share" | "rooms" | "wifi" | "key" | null>(null);
  const [rated, setRated] = useState(false);
  const [seen, setSeen] = useState(0);
  const q = Math.min(qty, guests);
  const mine = [...st.cleaning].filter(c => c.room_number === "101").sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  const mineOpen = mine && (mine.status === "requested" || mine.status === "in_progress");
  if (!me) return null;
  const notice = me.notice && me.noticeAt > seen ? <StayNotice kind={me.notice} startsAt={me.starts_at} endsAt={me.ends_at} onDismiss={() => setSeen(me.noticeAt)} /> : null;
  const resetTimes = () => st.setStays(l => l.map(x => x.id === "mine" ? { ...x, starts_at: new Date(Date.now() + 90000).toISOString(), checked_in_at: null, notice: null } : x));
  if (st.now >= Date.parse(me.ends_at)) return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-7 text-center">
      <h1 className="text-4xl">Tak for dit ophold</h1>
      <p className="max-w-sm text-muted-foreground">Dit ophold er slut. Gå til receptionen og tjek ud, hvis du ikke allerede har gjort det.</p>
      {rated ? <p className="text-sm text-status-clean" role="status">Tak for din rating. Personalet kan se den under Personale.</p> : <div className="w-full rounded-2xl border bg-card p-5 shadow-sm"><RatingForm onSubmit={(rating, comment) => { st.setRatings(l => [...l, { room: "101", rating, comment }]); setRated(true); toast("Demo: rating ikke gemt"); }} /></div>}
    </div>
  );
  if (st.now < Date.parse(me.starts_at)) return <WaitingScreen name="Anna" startsAt={me.starts_at} clock={st.now} notice={notice} onLogout={resetTimes} />;
  if (!me.checked_in_at) return <CheckInScreen name="Anna" room="101" notice={notice} onLogout={resetTimes} onCheckIn={() => { st.setStays(l => l.map(x => x.id === "mine" ? { ...x, checked_in_at: new Date().toISOString() } : x)); toast("Du er tjekket ind. Velkommen!"); }} />;
  const mealsChosen = [st.meals.breakfast, st.meals.lunch, st.meals.dinner].filter(Boolean).length;
  const mealChoices = { breakfast_choice: st.meals.breakfast, lunch_choice: st.meals.lunch, dinner_choice: st.meals.dinner };
  const TITLES = { towels: "Håndklæder", clean: "Rengøring", food: "Room service", share: "Del adgang", wifi: "Wi-Fi", meals: "Vælg måltider", rooms: "Mine værelser", key: "Digital nøgle" } as const;
  return (
    <div className="mx-auto max-w-md pb-[calc(env(safe-area-inset-bottom)+2rem)]">
      <header className="rounded-b-3xl bg-gradient-forest px-6 pb-7 pt-[calc(env(safe-area-inset-top)+1.75rem)] text-forest-foreground">
        <Logo />
        <p className="eyebrow mt-6 text-brass">Værelse 101</p>
        <h1 className="mt-2 text-4xl">Velkommen, Anna</h1>
      </header>
      <main className="space-y-5 px-4 pt-4">
        {notice}
        <section id="noegle" className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between"><p className="eyebrow text-muted-foreground">Digital nøgle · Værelse 101</p><span className="flex items-center gap-1 text-xs text-status-clean"><Check className="h-4 w-4" />Aktiv</span></div>
          <Button className="mt-3 h-16 w-full rounded-full bg-gradient-brass text-lg font-semibold text-accent-foreground shadow-soft" onClick={() => toast("Demo: dør ikke tilsluttet")}><KeyRound className="!h-6 !w-6" />Lås dør op</Button>
          <button type="button" onClick={() => setSheet("key")} className="mt-3 flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground"><QrCode className="h-4 w-4" />Vis QR-nøgle</button>
        </section>
        <SettingsGroup title="Bestil">
          <SettingsRow Icon={ShowerHead} tone="primary" title="Håndklæder" value={towelWait ? `Igen kl. ${hm(new Date(towelWait).toISOString())}` : `op til ${guests}`} onClick={() => setSheet("towels")} />
          <SettingsRow Icon={Utensils} tone="brass" title="Room service" value="Mad og drikke" onClick={() => setSheet("food")} />
          <SettingsRow Icon={Sparkles} tone="clean" title="Rengøring" value={mineOpen ? "Bestilt" : undefined} onClick={() => setSheet("clean")} />
        </SettingsGroup>
        <SettingsGroup title="Opholdet">
          <SettingsRow Icon={Leaf} tone="clean" title="Vælg måltider" value={mealsChosen ? `${mealsChosen} valgt` : undefined} onClick={() => setSheet("meals")} />
          <SettingsRow Icon={Wifi} tone="primary" title="Wi-Fi" onClick={() => setSheet("wifi")} />
        </SettingsGroup>
        <SettingsGroup>
          <SettingsRow Icon={Share2} tone="brass" title="Del adgang" onClick={() => setSheet("share")} />
          <SettingsRow Icon={DoorOpen} tone="forest" title="Mine værelser" onClick={() => setSheet("rooms")} />
        </SettingsGroup>
        <StayEndTimer endsAt={me.ends_at} clock={st.now} />
      </main>
      {sheet && <SubPage title={TITLES[sheet]} onBack={() => setSheet(null)}>
        {sheet === "key" && <PageCard>
          <div className="flex flex-col items-center gap-3"><div className="rounded-lg bg-forest p-4 text-forest-foreground"><QRCodeSVG value="HOTELPILOT-DEMO:101" size={200} bgColor="transparent" fgColor="currentColor" /></div><p className="text-center text-sm text-muted-foreground">Din digitale værelsesnøgle · simuleret dørlås</p></div>
        </PageCard>}
        {sheet === "towels" && <PageCard>
          <p className="text-center text-sm text-muted-foreground">Hvor mange håndklæder skal byttes?</p>
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" aria-label="Færre" disabled={q <= 1} onClick={() => setQty(q - 1)}><Minus /></Button>
            <span className="w-10 text-center text-3xl font-semibold leading-none tabular-nums">{q}</span>
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" aria-label="Flere" disabled={q >= guests} onClick={() => setQty(q + 1)}><Plus /></Button>
          </div>
          <p className="text-center text-sm text-muted-foreground">Op til {guests} ad gangen. Håndklæder kan bestilles 1 gang hver 12. time.</p>
          {towelWait && <p role="status" className="rounded-md bg-secondary p-3 text-sm">Du kan bestille håndklæder igen kl. {hm(new Date(towelWait).toISOString())}.</p>}
          <Button className="w-full" disabled={!!towelWait} onClick={() => { setQty(1); setTowelAt(Date.now()); toast("Demo: bestilling ikke gemt"); }}>Bestil {q} {q === 1 ? "håndklæde" : "håndklæder"}</Button>
        </PageCard>}
        {sheet === "food" && <PageCard><RoomService room="101" onSubmit={(d) => { toast(`Demo: ${d} — ikke sendt til køkkenet`); }} /></PageCard>}
        {sheet === "clean" && <>
          <PageCard><CleaningStatusNote req={mine} />{!mine && <p className="text-sm text-muted-foreground">Vælg om du vil have rengøring, og hvornår det passer.</p>}</PageCard>
          {!mineOpen && <PageCard>
            <CleaningForm room="101" guests={guests} onSubmit={(towels, from, until) => {
              const repeat = mine?.status === "not_reached";
              st.setCleaning(l => [...l, { id: `c${Date.now()}`, room_number: "101", guest_name: "Anna (dig)", wants_towels: towels > 0, towel_count: towels, away_from: from ? from.toISOString() : null, away_until: until ? until.toISOString() : null, status: "requested", is_repeat: repeat, created_at: new Date().toISOString() }]);
              toast("Demo: personalet kan se den under Personale (ikke gemt)");
            }} />
          </PageCard>}
        </>}
        {sheet === "meals" && <PageCard><MealsForm choices={mealChoices} onChoose={(m, c) => st.setMeals(l => ({ ...l, [m]: l[m] === c ? null : c }))} /></PageCard>}
        {sheet === "wifi" && <div className="rounded-2xl bg-gradient-forest p-5 text-forest-foreground"><p className="text-sm opacity-80">Netværk og kode vises her, når du er logget ind som rigtig gæst.</p></div>}
        {sheet === "share" && <PageCard>
          <p className="text-sm">Scan koden eller del linket. Der er plads til {guests + 2} enheder ({guests} personer + 2 ekstra).</p>
          <div className="flex justify-center rounded-lg bg-secondary p-5"><QRCodeSVG value="https://hotelpilot.example/gaest?t=demo" size={180} bgColor="transparent" fgColor="currentColor" /></div>
          <Button variant="outline" className="w-full" onClick={async () => { const r = await shareLink({ title: "HotelPilot", text: "Her er adgang til værelse 101 på HotelPilot:", url: "https://hotelpilot.example/gaest?t=demo" }); if (r === "copied") toast.success("Link kopieret"); else if (r === "failed") toast.error("Linket kunne ikke deles"); }}><Share2 />Del link</Button>
        </PageCard>}
        {sheet === "rooms" && <PageCard><RoomSwitcher rooms={[{ t: "a", d: "a", room: "101", name: "Anna Nielsen" }, { t: "b", d: "b", room: "102", name: "Anna Nielsen" }]} active="a" onOpen={() => toast("Demo: her skifter appen til værelse 102 med dets eget kontrolsystem")} onAdd={() => toast("Demo: her logger du ind med endnu et bookingnummer")} /></PageCard>}
      </SubPage>}
    </div>
  );
}
