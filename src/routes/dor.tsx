import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/hotel/logo";
import { listenDoorOpen } from "@/lib/door-signal";

export const Route = createFileRoute("/dor")({
  head: () => ({
    meta: [
      { title: "Dør — HotelPilot" },
      { name: "description", content: "Demo-dør, der åbner, når gæsten trykker Lås dør op i appen." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DoorScreen,
});

const OPEN_MS = 6000;

function DoorScreen() {
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = useCallback(() => {
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), OPEN_MS);
  }, []);

  useEffect(() => {
    const stop = listenDoorOpen(trigger, setConnected);
    return () => { stop(); if (timer.current) clearTimeout(timer.current); };
  }, [trigger]);

  return (
    <main className="flex min-h-screen flex-col items-center bg-gradient-forest px-6 py-8 text-forest-foreground">
      <Logo size={44} className="[&>span:last-child]:text-4xl" />
      <p className="eyebrow mt-3 text-brass">Værelse 101</p>

      <div className="flex w-full flex-1 flex-col items-center justify-center gap-8">
        <button type="button" onClick={trigger} aria-label={open ? "Døren er åben" : "Døren er låst. Tryk for at prøve."} className="door-scene outline-none focus-visible:ring-2 focus-visible:ring-brass">
          <div className="door-frame">
            <div className="door-room" aria-hidden="true">
              <span className="door-room-text">Velkommen</span>
            </div>
            <div className={`door-panel ${open ? "is-open" : ""}`}>
              <span className="door-number">101</span>
              <span className={`door-led ${open ? "on" : ""}`} />
              <span className="door-handle" />
            </div>
          </div>
        </button>

        <div className="text-center" role="status" aria-live="polite">
          <p className={`text-3xl font-semibold transition-colors ${open ? "text-status-clean" : ""}`}>{open ? "Åben" : "Låst"}</p>
          <p className="mt-1 text-sm text-forest-foreground/70">{open ? "Døren lukker igen om lidt" : "Tryk Lås dør op i appen, så åbner døren"}</p>
        </div>
      </div>

      <p className="flex items-center gap-2 text-xs text-forest-foreground/60">
        <span className={`h-2 w-2 rounded-full ${connected ? "bg-status-clean" : "bg-status-dirty"}`} />
        {connected ? "Forbundet til appen" : "Forbinder…"} · Demo
      </p>

      <style>{`
        .door-scene{background:none;border:0;padding:0;perspective:1100px;cursor:pointer}
        .door-frame{position:relative;width:min(62vw,260px);aspect-ratio:3/5;border:10px solid oklch(0.82 0.04 260 / .35);border-bottom-width:0;border-radius:6px 6px 0 0;background:oklch(0.16 0.03 265)}
        .door-room{position:absolute;inset:0;display:grid;place-items:center;padding-left:30%;background:radial-gradient(ellipse at 50% 60%,oklch(0.9 0.12 85),oklch(0.62 0.12 70) 70%);color:oklch(0.25 0.04 70)}
        .door-room-text{font-family:Georgia,serif;font-size:1.3rem;font-style:italic}
        .door-panel{position:absolute;inset:0;transform-origin:left center;transform:rotateY(0deg);transition:transform .9s cubic-bezier(.3,.7,.2,1);background:linear-gradient(160deg,oklch(0.42 0.05 265),oklch(0.3 0.05 270));border:1px solid oklch(1 0 0 / .12);box-shadow:inset 0 0 0 10px oklch(0 0 0 / .08)}
        .door-panel.is-open{transform:rotateY(-78deg)}
        .door-number{position:absolute;top:16%;left:50%;transform:translateX(-50%);font-size:1.1rem;letter-spacing:.2em;color:oklch(0.82 0.1 85)}
        .door-led{position:absolute;top:30%;right:14%;width:12px;height:12px;border-radius:50%;background:oklch(0.62 0.2 28);box-shadow:0 0 10px oklch(0.62 0.2 28 / .8);transition:background .3s,box-shadow .3s}
        .door-led.on{background:oklch(0.78 0.2 150);box-shadow:0 0 14px oklch(0.78 0.2 150 / .9)}
        .door-handle{position:absolute;top:52%;right:12%;width:34px;height:8px;border-radius:4px;background:oklch(0.82 0.1 85);box-shadow:0 2px 4px oklch(0 0 0 / .4)}
        @media (prefers-reduced-motion:reduce){.door-panel{transition:none}}
      `}</style>
    </main>
  );
}
