import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { detectAppMode } from "@/lib/platform";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { StaffShell } from "@/components/staff/shell";
import { resolveNav, type Section } from "@/components/staff/core";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/personale")({
  validateSearch: (search: Record<string, unknown>): { s?: string; p?: string } => ({
    ...(typeof search["s"] === "string" ? { s: search["s"] } : {}),
    ...(typeof search["p"] === "string" ? { p: search["p"] } : {}),
  }),
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

function Staff() {
  const [pin, setPin] = useState<string | null | undefined>(undefined);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { s, p } = Route.useSearch();
  const { section, page } = resolveNav(s, p);

  // Gæste-appen (installeret PWA / Capacitor) har ingen personaleadgang.
  useEffect(() => { if (detectAppMode()) navigate({ to: "/", replace: true }); }, [navigate]);

  useEffect(() => { setPin(sessionStorage.getItem("hp-staff")); }, []);
  if (pin === undefined) return <div className="min-h-screen bg-gradient-forest" aria-busy="true" />;

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data } = await supabase.rpc("staff_check", { _pin: input });
    setBusy(false);
    if (!data) { toast.error("Forkert personalekode"); return; }
    sessionStorage.setItem("hp-staff", input);
    setPin(input);
  }
  const logout = () => { sessionStorage.removeItem("hp-staff"); setPin(null); setInput(""); };

  if (!pin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-forest px-6 text-forest-foreground">
        <form onSubmit={login} className="w-full max-w-sm text-center">
          <p className="eyebrow text-brass">HotelPilot</p>
          <h1 className="mt-2 text-4xl">Personale</h1>
          <input type="password" inputMode="numeric" autoComplete="current-password" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Personalekode" aria-label="Personalekode"
            className="mt-8 w-full rounded-2xl border border-forest-foreground/20 bg-forest/60 px-4 py-4 text-center text-2xl tracking-[0.5em] outline-none" />
          <Button disabled={busy} className="mt-4 h-auto w-full rounded-full bg-gradient-brass py-4 font-semibold text-accent-foreground">Log ind</Button>
          <Link to="/demo" className="mt-6 inline-block text-sm text-brass underline">Prøv demo (ingen data gemmes)</Link><br />
          <Link to="/" className="mt-3 inline-block text-sm opacity-70">← Til gæsteportalen</Link>
        </form>
      </div>
    );
  }
  return <StaffShell pin={pin} section={section} page={page} onNavigate={(next: Section, nextPage?: string) => navigate({ to: "/personale", search: { s: next, ...(nextPage ? { p: nextPage } : {}) }, replace: false })} onLogout={logout} />;
}
