import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import hero from "@/assets/hero.jpg";
import { guestLogin, saveSession } from "@/lib/hotel";
import { useAppMode, usePhone } from "@/lib/platform";
import { InstallHint } from "@/components/hotel/install-hint";
import { Logo } from "@/components/hotel/logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "HotelPilot — Gæsteportal" },
      { name: "description", content: "Log ind med dit bookingnummer og navn, og tjek ind fra telefonen." },
      { property: "og:title", content: "HotelPilot — Gæsteportal" },
      { property: "og:description", content: "Din digitale concierge: digital nøgle, room service og rengøring." },
    ],
  }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const [ref, setRef] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const appMode = useAppMode();
  const phone = usePhone();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const s = await guestLogin(ref, name);
      saveSession(s);
      navigate({ to: "/gaest", search: { t: undefined } });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-forest text-forest-foreground">
      <img src={hero} alt="Hotellets lounge" width={1024} height={1536} className="absolute inset-0 h-full w-full object-cover opacity-55" />
      <div className="absolute inset-0 bg-gradient-to-t from-forest via-forest/70 to-transparent" />
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-between px-6 pb-[calc(env(safe-area-inset-bottom)+2.5rem)] pt-[calc(env(safe-area-inset-top)+2.5rem)]">
        <div className="flex items-center justify-between">
          <Logo />
          {appMode === false && phone === false && <Link to="/personale" className="eyebrow text-brass">Personale</Link>}
        </div>
        <div>
          <p className="eyebrow text-brass">Velkommen</p>
          <h1 className="mt-3 text-5xl leading-[1.05]">Dit ophold, <em>samlet ét sted.</em></h1>
          <form onSubmit={submit} className="mt-8 space-y-3">
            <Field label="Bookingnummer" value={ref} onChange={setRef} placeholder="HP-1001" />
            <Field label="Fulde navn" value={name} onChange={setName} placeholder="Som på bookingen" autoComplete="name" />
            {err && <p className="text-sm text-status-dirty">{err}</p>}
            <button disabled={busy} className="w-full rounded-full bg-gradient-brass py-4 font-semibold text-accent-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60">
              {busy ? "Logger ind…" : "Log ind"}
            </button>
          </form>
          {phone === false && <p className="mt-5 text-center text-sm"><Link to="/demo" className="text-brass underline">Prøv demo (ingen data gemmes)</Link></p>}
          {appMode === false && <InstallHint />}
        </div>
      </div>
    </div>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; placeholder: string; inputMode?: "numeric"; autoComplete?: string }) {
  return (
    <label className="block rounded-2xl border border-forest-foreground/20 bg-forest/60 px-4 py-3 backdrop-blur">
      <span className="eyebrow text-forest-foreground/60">{props.label}</span>
      <input
        required
        value={props.value}
        inputMode={props.inputMode}
        autoComplete={props.autoComplete}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className="mt-1 block w-full bg-transparent text-lg outline-none placeholder:text-forest-foreground/30"
      />
    </label>
  );
}
