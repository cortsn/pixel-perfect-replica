import { useEffect, useState } from "react";
import { isIos } from "@/lib/platform";

type InstallEvent = Event & { prompt: () => Promise<void> };

/** Viser hvordan gæsten lægger appen på hjemmeskærmen (kun i browser, ikke i installeret app). */
export function InstallHint() {
  const [ev, setEv] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setIos(isIos());
    try { setDismissed(localStorage.getItem("hp-install-dismissed") === "1"); } catch { setDismissed(false); }
    const onPrompt = (e: Event) => { e.preventDefault(); setEv(e as InstallEvent); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (dismissed || (!ev && !ios)) return null;

  function close() {
    setDismissed(true);
    try { localStorage.setItem("hp-install-dismissed", "1"); } catch { /* ignorer */ }
  }

  return (
    <div className="mt-5 rounded-2xl border border-forest-foreground/20 bg-forest/60 p-4 text-sm backdrop-blur">
      <p className="eyebrow text-brass">Læg appen på din telefon</p>
      {ev ? (
        <button
          onClick={async () => { await ev.prompt(); setEv(null); }}
          className="mt-2 w-full rounded-full border border-brass py-2 font-medium text-brass"
        >
          Installér HotelPilot
        </button>
      ) : (
        <p className="mt-2 text-forest-foreground/80">
          Tryk på <strong>Del</strong>-knappen i Safari og vælg <strong>Føj til hjemmeskærm</strong>.
        </p>
      )}
      <button onClick={close} className="mt-2 text-xs text-forest-foreground/50 underline">Skjul</button>
    </div>
  );
}
