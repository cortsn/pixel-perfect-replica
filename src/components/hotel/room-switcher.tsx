import { Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StoredRoom } from '@/lib/hotel';

/** Liste over de værelser gæsten har åbnet i appen. */
export function RoomSwitcher({ rooms, active, onOpen, onAdd }: { rooms: StoredRoom[]; active: string | null; onOpen: (token: string) => void; onAdd: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Har du flere værelser, kan du skifte mellem dem her.</p>
      <ul className="divide-y rounded-lg border">
        {rooms.map(r => (
          <li key={r.t} className="flex items-center justify-between gap-3 p-3">
            <span className="min-w-0"><span className="block font-semibold">Værelse {r.room ?? '?'}</span>{r.name && <span className="block truncate text-xs text-muted-foreground">{r.name}</span>}</span>
            {r.t === active ? <span className="flex items-center gap-1 text-xs text-status-clean"><Check className="h-4 w-4" />Åbent</span> : <Button size="sm" variant="outline" onClick={() => onOpen(r.t)}>Åbn</Button>}
          </li>
        ))}
      </ul>
      <Button className="w-full" variant="outline" onClick={onAdd}><Plus />Tilføj et andet værelse</Button>
    </div>
  );
}
