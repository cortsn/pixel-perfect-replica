import { useEffect, useState } from "react";

/**
 * Er siden åbnet som installeret app (PWA på hjemmeskærmen eller Capacitor)?
 * Personalet bruger almindelig browser på computer, så her skjuler vi
 * personale-indgangen for gæsterne.
 */
export function detectAppMode(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  if (w.Capacitor?.isNativePlatform?.()) return true;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  if ((navigator as unknown as { standalone?: boolean }).standalone) return true; // iOS Safari
  return false;
}

/** `null` før klienten har målt (undgår hydration-forskel), derefter true/false. */
export function useAppMode(): boolean | null {
  const [mode, setMode] = useState<boolean | null>(null);
  useEffect(() => setMode(detectAppMode()), []);
  return mode;
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Er skærmen en telefon (smal skærm)? Personale- og demovisning er ikke til telefonen, kun gæsteappen. */
export const PHONE_MAX_WIDTH = 767;
export function isPhone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.(`(max-width: ${PHONE_MAX_WIDTH}px)`).matches ?? window.innerWidth <= PHONE_MAX_WIDTH;
}

/** `null` før klienten har målt, derefter true/false. Opdateres, hvis vinduet ændrer størrelse. */
export function usePhone(): boolean | null {
  const [phone, setPhone] = useState<boolean | null>(null);
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH}px)`);
    const update = () => setPhone(isPhone());
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return phone;
}
