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
