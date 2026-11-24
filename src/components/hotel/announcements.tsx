import { useCallback, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HotelModal } from '@/components/hotel/modal';

export type GuestAnnouncement = { id: string; message: string; created_at: string };
export type GuestFeatures = { roomservice: boolean; towels: boolean; cleaning: boolean; meals: boolean; events: boolean; map: boolean };
export const ALL_FEATURES: GuestFeatures = { roomservice: true, towels: true, cleaning: true, meals: true, events: true, map: true };
const KEY = 'hp-announcements-seen';
const readSeen = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]; } catch { return []; } };

/** Hotellets beskeder som popup: én ad gangen, nyeste først, og hver besked vises kun én gang pr. enhed. */
export function useAnnouncementPopup(list: GuestAnnouncement[], persist = true) {
  const [seen, setSeen] = useState<string[]>(persist ? readSeen : []);
  const current = [...list].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).find(a => !seen.includes(a.id)) ?? null;
  const dismiss = useCallback((id: string) => {
    setSeen(s => {
      const next = [...s, id].slice(-50);
      if (persist) try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ingen lagring */ }
      return next;
    });
  }, [persist]);
  return { current, dismiss };
}

export function AnnouncementPopup({ announcement, onClose }: { announcement: GuestAnnouncement | null; onClose: (id: string) => void }) {
  if (!announcement) return null;
  return (
    <HotelModal title="Besked fra hotellet" onClose={() => onClose(announcement.id)}>
      <div className="flex justify-center"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-brass/20 text-brass"><Megaphone className="h-6 w-6" /></span></div>
      <p className="break-words text-center text-lg leading-snug" role="alert">{announcement.message}</p>
      <Button className="h-12 w-full rounded-full" onClick={() => onClose(announcement.id)}>OK</Button>
    </HotelModal>
  );
}
