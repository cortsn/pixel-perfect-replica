import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, ClipboardList, DoorOpen, KeyRound, Leaf, Minus, Plus, ReceiptText, RotateCcw, Share2, ShowerHead, Sparkles, Utensils, Wifi } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Logo } from "@/components/hotel/logo";
import { PageCard, SettingsGroup, SettingsRow, SubPage } from "@/components/hotel/settings-ui";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StaffShell } from "@/components/staff/shell";
import type { Section } from "@/components/staff/core";
import { MealsForm } from "@/components/hotel/meals";
import { RatingForm } from "@/components/hotel/rating";
import { RoomSwitcher } from "@/components/hotel/room-switcher";
import { RoomService } from "@/components/hotel/room-service";
import { StatusPill } from "@/components/hotel/status-pill";
import { CleaningForm, CleaningStatusNote } from "@/components/hotel/guest-requests";
import { CheckInScreen, StayEndTimer, StayNotice, WaitingScreen } from "@/components/hotel/stay";
import { setRpcBackend, type CleaningRequest } from "@/lib/cleaning";
import { DEMO_PIN, demoGuest, demoRpc, demoStore } from "@/lib/demo-db";
import { categoryLabel } from "@/lib/billing";
import { errorText, HOUSEKEEPING_LABELS, MEAL_FIELD, type Meal, type OrderStatus } from "@/lib/hotel";
import { fmtDKK } from "@/lib/money";
import { shareLink } from "@/lib/share";
import { cancellable, hm, towelNextAt } from "@/lib/stay";

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

// Alt på denne side kører på en database i browseren (src/lib/demo-db.ts). Gæstesiden og personalesiden deler den,
// så en bestilling fra gæsten dukker op hos personalet. Der sendes intet til en server, og alt nulstilles ved genindlæsning.

/** Opdaterer komponenten, hver gang demo-databasen ændres. */
const useDemoVersion = () => useSyncExternalStore(demoStore.subscribe, demoStore.version, demoStore.version);

function Demo() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<"guest" | "staff">("guest");
  const [section, setSection] = useState<Section>("dashboard");
  useEffect(() => {
    // Personalesiden bruger de samme sider som den rigtige side, men med demo-databasen som datakilde.
    demoStore.reset();
    setRpcBackend({ call: (name, args) => demoRpc(name, args), subscribe: demoStore.subscribe });
    setReady(true);
    return () => setRpcBackend(null);
  }, []);
  if (!ready) return <div className="min-h-screen" aria-busy="true" />;

  const bar = (
    <>
      <div className="bg-brass px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] text-center text-sm font-semibold text-accent-foreground">
        DEMO — eksempeldata. Intet gemmes, og alt nulstilles, når du genindlæser siden.
      </div>
      <nav className="flex flex-wrap items-center justify-center gap-2 border-b bg-background p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1" aria-label="Skift visning">{view === "staff" ? "Personale" : "Gæst (værelse 101)"}<ChevronDown className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => setView("guest")}>{view === "guest" && <Check className="h-4 w-4" />}Gæst (værelse 101)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setView("staff")}>{view === "staff" && <Check className="h-4 w-4" />}Personale</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {view === "guest" && <Button variant="ghost" size="sm" onClick={() => demoGuest.endStay()}>Afslut gæstens ophold</Button>}
        <Button variant="ghost" size="sm" onClick={() => { demoStore.reset(); toast("Demoen er nulstillet"); }}><RotateCcw />Nulstil demo</Button>
        <Link to="/" className="text-sm text-muted-foreground underline">Til forsiden</Link>
      </nav>
    </>
  );

  return view === "staff"
    ? <StaffShell pin={DEMO_PIN} section={section} onSection={setSection} onLogout={() => setView("guest")} demoBar={bar} />
    : <div className="min-h-screen">{bar}<GuestDemo /></div>;
}

type GuestSheet = "towels" | "clean" | "food" | "orders" | "bill" | "meals" | "wifi" | "share" | "rooms" | null;
const TITLES: Record<Exclude<GuestSheet, null>, string> = { towels: "Håndklæder", clean: "Rengøring", food: "Room service", orders: "Dine bestillinger", bill: "Din regning", meals: "Vælg måltider", wifi: "Wi-Fi", share: "Del adgang", rooms: "Mine værelser" };

/** Gæstesiden i demoen: samme opbygning som den rigtige, men med demo-databasen som kilde. */
function GuestDemo() {
  useDemoVersion();
  const [now, setNow] = useState(() => Date.now());
  const [sheet, setSheet] = useState<GuestSheet>(null);
  const [qty, setQty] = useState(1);
  const [seen, setSeen] = useState<string | null>(null);
  const [rated, setRated] = useState(false);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const b = demoGuest.booking();
  const guests = b.guests;
  const room = demoStore._state().rooms.find((r) => r.number === b.room_number)!;
  const run = (f: () => void) => { try { f(); } catch (e) { toast.error(errorText(e as Error)); } };

  const notice = b.notice_kind && b.notice_at && b.notice_at !== seen
    ? <StayNotice kind={b.notice_kind} startsAt={b.starts_at} endsAt={b.ends_at} onDismiss={() => setSeen(b.notice_at)} /> : null;

  if (now >= Date.parse(b.ends_at)) return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-5 px-7 text-center">
      <h1 className="text-4xl">Tak for dit ophold</h1>
      <p className="max-w-sm text-muted-foreground">Dit ophold er slut. Gå til receptionen og tjek ud, hvis du ikke allerede har gjort det.</p>
      {rated
        ? <p className="text-sm text-status-clean" role="status">Tak for din rating. Personalet kan se den under Statistik.</p>
        : <div className="w-full rounded-2xl border bg-card p-5 shadow-sm"><RatingForm onSubmit={(rating, comment) => { demoGuest.rate(rating, comment); setRated(true); toast("Tak for din rating"); }} /></div>}
    </div>
  );
  if (now < Date.parse(b.starts_at)) return <WaitingScreen name="Anna" startsAt={b.starts_at} clock={now} notice={notice} onLogout={() => demoGuest.resetTimes()} />;
  if (!b.checked_in_at) return <CheckInScreen name="Anna" room={b.room_number} notice={notice} onLogout={() => demoGuest.resetTimes()} onCheckIn={() => { demoGuest.checkIn(); toast("Du er tjekket ind. Velkommen!"); }} />;

  const menu = demoGuest.menu();
  const orders = demoGuest.orders();
  const bill = demoGuest.bill();
  const cleaning = demoGuest.cleaning() as CleaningRequest | null;
  const cleaningOpen = !!cleaning && ["requested", "in_progress"].includes(cleaning.status);
  const towelNext = towelNextAt(orders, now);
  const activeOrders = orders.filter((o) => cancellable(o.status)).length;
  const meals = { breakfast_choice: b.breakfast_choice, lunch_choice: b.lunch_choice, dinner_choice: b.dinner_choice };
  const mealsChosen = Object.values(meals).filter(Boolean).length;
  const wifi = demoStore._state().wifi;
  const close = () => setSheet(null);

  return (
    <div className="mx-auto max-w-md pb-[calc(env(safe-area-inset-bottom)+2rem)]">
      <header className="rounded-b-3xl bg-gradient-forest px-6 pb-7 pt-7 text-forest-foreground">
        <Logo />
        <p className="eyebrow mt-6 text-brass">Værelse {b.room_number}</p>
        <h1 className="mt-2 text-4xl">Velkommen, Anna</h1>
        <p className="mt-2 text-xs text-forest-foreground/70">Check ud {new Date(b.ends_at).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
      </header>
      <main className="space-y-5 px-4 pt-4">
        {notice}
        <section id="noegle" className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between"><p className="eyebrow text-muted-foreground">Digital nøgle · Værelse {b.room_number}</p><span className="flex items-center gap-1 text-xs text-status-clean"><Check className="h-4 w-4" />Aktiv</span></div>
          <Button className="mt-3 h-16 w-full rounded-full bg-gradient-brass text-lg font-semibold text-accent-foreground shadow-soft" onClick={() => toast("Demo: dør ikke tilsluttet")}><KeyRound className="!h-6 !w-6" />Lås dør op</Button>
        </section>
        <SettingsGroup title="Bestil">
          <SettingsRow Icon={ShowerHead} tone="primary" title="Håndklæder" value={towelNext ? `Igen kl. ${hm(new Date(towelNext).toISOString())}` : `op til ${guests}`} onClick={() => { setQty(Math.max(1, Math.min(qty, guests))); setSheet("towels"); }} />
          <SettingsRow Icon={Utensils} tone="brass" title="Room service" value={menu.settings && !menu.settings.open_now ? `Åbner ${menu.settings.opens_at}` : "Mad og drikke"} onClick={() => setSheet("food")} />
          <SettingsRow Icon={Sparkles} tone="clean" title="Rengøring" value={HOUSEKEEPING_LABELS[room.housekeeping_status]} onClick={() => setSheet("clean")} />
          <SettingsRow Icon={ReceiptText} tone="forest" title="Din regning" value={fmtDKK(bill.total_cents)} onClick={() => setSheet("bill")} />
          {orders.length > 0 && <SettingsRow Icon={ClipboardList} tone="forest" title="Dine bestillinger" badge={activeOrders} value={activeOrders ? undefined : String(orders.length)} onClick={() => setSheet("orders")} />}
        </SettingsGroup>
        <SettingsGroup title="Opholdet">
          <SettingsRow Icon={Leaf} tone="clean" title="Vælg måltider" value={mealsChosen ? `${mealsChosen} valgt` : undefined} onClick={() => setSheet("meals")} />
          <SettingsRow Icon={Wifi} tone="primary" title="Wi-Fi" value={wifi.ssid} onClick={() => setSheet("wifi")} />
        </SettingsGroup>
        <SettingsGroup>
          <SettingsRow Icon={Share2} tone="brass" title="Del adgang" onClick={() => setSheet("share")} />
          <SettingsRow Icon={DoorOpen} tone="forest" title="Mine værelser" onClick={() => setSheet("rooms")} />
        </SettingsGroup>
        <StayEndTimer endsAt={b.ends_at} clock={now} />
      </main>

      {sheet && <SubPage title={TITLES[sheet]} onBack={close}>
        {sheet === "towels" && <PageCard>
          <p className="text-center text-sm text-muted-foreground">Hvor mange håndklæder skal byttes?</p>
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" aria-label="Færre håndklæder" disabled={qty <= 1} onClick={() => setQty(qty - 1)}><Minus /></Button>
            <span className="w-10 text-center text-3xl font-semibold leading-none tabular-nums" aria-label="Antal håndklæder">{qty}</span>
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" aria-label="Flere håndklæder" disabled={qty >= guests} onClick={() => setQty(qty + 1)}><Plus /></Button>
          </div>
          <p className="text-center text-sm text-muted-foreground">Op til {guests} ad gangen. Håndklæder kan bestilles 1 gang hver 12. time.</p>
          {towelNext && <p role="status" className="rounded-md bg-secondary p-3 text-sm">Du har allerede bestilt håndklæder. Du kan bestille igen kl. {hm(new Date(towelNext).toISOString())}.</p>}
          <Button className="w-full" disabled={!!towelNext} onClick={() => run(() => { demoGuest.orderTowels(qty); toast.success("Din bestilling er modtaget"); close(); })}>Bestil {qty} {qty === 1 ? "håndklæde" : "håndklæder"}</Button>
        </PageCard>}
        {sheet === "food" && <PageCard><RoomService room={b.room_number} menu={menu} onSubmit={(lines, note) => { try { demoGuest.orderMenu(lines, note); toast.success("Din bestilling er modtaget og lægges på din regning"); close(); return true; } catch (e) { toast.error(errorText(e as Error)); return false; } }} /></PageCard>}
        {sheet === "clean" && <>
          <PageCard><p className="text-sm text-muted-foreground">{HOUSEKEEPING_LABELS[room.housekeeping_status]}</p><CleaningStatusNote req={cleaning} />{!cleaning && <p className="text-sm text-muted-foreground">Vælg om du vil have rengøring, og hvornår det passer.</p>}</PageCard>
          {!cleaningOpen && <PageCard><CleaningForm room={b.room_number} guests={guests} onSubmit={(towels, from, until) => run(() => { demoGuest.requestCleaning(towels, from, until); toast.success("Personalet er underrettet."); })} /></PageCard>}
        </>}
        {sheet === "orders" && <PageCard><ul className="divide-y">{orders.map((o) => (
          <li key={o.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="break-words text-sm">{o.details}</p>{!!o.total_cents && <p className="text-xs text-muted-foreground">{fmtDKK(o.total_cents)}</p>}{o.status === "rejected" && <p className="text-xs text-destructive">Afvist{o.reject_reason ? `: ${o.reject_reason}` : ""}</p>}</div>
              <StatusPill status={o.status as OrderStatus} />
            </div>
            {cancellable(o.status) && <Button size="sm" variant="ghost" className="mt-2 text-destructive" onClick={() => run(() => { demoGuest.cancelOrder(o.id); toast.success("Bestillingen er annulleret"); })}>Annuller bestilling</Button>}
          </li>))}</ul></PageCard>}
        {sheet === "bill" && <PageCard>
          {bill.items.length === 0
            ? <p className="text-sm text-muted-foreground">Der er endnu intet på din regning. Roomservice og andre køb dukker op her, så snart de er leveret.</p>
            : <><ul className="divide-y">{bill.items.map((i) => <li key={i.id} className="flex items-start justify-between gap-3 py-2.5"><span className="min-w-0"><span className="block break-words text-sm">{i.quantity > 1 ? `${i.quantity}× ` : ""}{i.description}</span><span className="text-xs text-muted-foreground">{categoryLabel(i.category)}</span></span><span className="shrink-0 text-sm tabular-nums">{fmtDKK(i.quantity * i.unit_price_cents)}</span></li>)}</ul>
              <div className="flex justify-between border-t pt-3 font-semibold"><span>I alt</span><span>{fmtDKK(bill.total_cents)}</span></div></>}
          <p className="rounded-md bg-secondary p-3 text-xs text-muted-foreground">Regningen betales ved check ud i receptionen. Nye køb kommer på, når de er leveret.</p>
        </PageCard>}
        {sheet === "meals" && <PageCard><MealsForm choices={meals} onChoose={(m: Meal, c) => { const f = MEAL_FIELD[m]; demoGuest.setMeal(m, meals[f] === c ? null : c); toast.success("Tak for dit svar"); }} /></PageCard>}
        {sheet === "wifi" && <div className="rounded-2xl bg-gradient-forest p-5 text-forest-foreground"><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs opacity-60">Netværk</p><p className="break-all">{wifi.ssid}</p></div><div><p className="text-xs opacity-60">Adgangskode</p><p className="break-all font-mono">{wifi.password}</p></div></div></div>}
        {sheet === "share" && <PageCard>
          <p className="text-sm">Scan koden eller del linket. Der er plads til {guests + 2} enheder ({guests} personer + 2 ekstra).</p>
          <div className="flex justify-center rounded-lg bg-secondary p-5"><QRCodeSVG value="https://hotelpilot.example/gaest?t=demo" size={180} bgColor="transparent" fgColor="currentColor" /></div>
          <Button variant="outline" className="w-full" onClick={async () => { const r = await shareLink({ title: "HotelPilot", text: `Her er adgang til værelse ${b.room_number} på HotelPilot:`, url: "https://hotelpilot.example/gaest?t=demo" }); if (r === "copied") toast.success("Link kopieret"); else if (r === "failed") toast.error("Linket kunne ikke deles"); }}><Share2 />Del link</Button>
        </PageCard>}
        {sheet === "rooms" && <PageCard><RoomSwitcher rooms={[{ t: "a", d: "a", room: b.room_number, name: "Anna Nielsen" }, { t: "b", d: "b", room: "102", name: "Anna Nielsen" }]} active="a" onOpen={() => toast("Demo: her skifter appen til værelse 102 med dets eget kontrolsystem")} onAdd={() => toast("Demo: her logger du ind med endnu et bookingnummer")} /></PageCard>}
      </SubPage>}
    </div>
  );
}
