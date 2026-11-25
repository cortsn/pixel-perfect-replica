import { useCallback, useState } from 'react';
import { Megaphone } from 'lucide-react';

export type GuestAnnouncement = { id: string; message: string; created_at: string };
export type GuestFeatures = { roomservice: boolean; towels: boolean; cleaning: boolean; meals: boolean; events: boolean; map: boolean };
export const ALL_FEATURES: GuestFeatures = { roomservice: true, towels: true, cleaning: true, meals: true, events: true, map: true };
const KEY = 'hp-announcements-seen';
const readSeen = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]; } catch { return []; } };

/** Hvilke af hotellets beskeder gæsten har set. Nye beskeder vises som en boble i siden, aldrig som en popup foran alt andet. */
export function useAnnouncements(list: GuestAnnouncement[], persist = true) {
  const [seen, setSeen] = useState<string[]>(persist ? readSeen : []);
  const unread = list.filter(a => !seen.includes(a.id));
  const markAllRead = useCallback(() => {
    setSeen(s => {
      const next = [...new Set([...s, ...list.map(a => a.id)])].slice(-100);
      if (next.length === s.length) return s;
      if (persist) try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ingen lagring */ }
      return next;
    });
  }, [list, persist]);
  return { unread, isUnread: (id: string) => !seen.includes(id), markAllRead };
}

/** Lille boble ved kanten af skærmen, så døren stadig kan låses op uden at noget dækker for den. */
export function AnnouncementBubble({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (count < 1) return null;
  return (
    <button type="button" onClick={onOpen} aria-label={`${count} ${count === 1 ? 'ny besked' : 'nye beskeder'} fra hotellet`}
      className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 items-center gap-2 rounded-l-full bg-brass py-3 pl-4 pr-3 text-accent-foreground shadow-lg transition active:scale-95">
      <span className="relative flex h-7 w-7 items-center justify-center"><Megaphone className="h-6 w-6" />
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold text-destructive-foreground">{count}</span></span>
      <span className="text-sm font-semibold">Hotellet</span>
    </button>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString('da-DK', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Alle beskeder fra hotellet, nyeste først. Nye er fremhævet. */
export function AnnouncementList({ list, isUnread }: { list: GuestAnnouncement[]; isUnread: (id: string) => boolean }) {
  if (list.length === 0) return <p className="text-sm text-muted-foreground">Der er ingen beskeder fra hotellet.</p>;
  return (
    <ul className="space-y-3">
      {list.map(a => (
        <li key={a.id} className={`rounded-xl border p-3 ${isUnread(a.id) ? 'border-brass bg-brass/10' : 'bg-card'}`}>
          <p className="break-words leading-snug">{a.message}</p>
          <p className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">{when(a.created_at)}{isUnread(a.id) && <span className="rounded-full bg-brass px-2 py-0.5 font-semibold text-accent-foreground">Ny</span>}</p>
        </li>
      ))}
    </ul>
  );
}
