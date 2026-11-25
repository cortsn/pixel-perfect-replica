import { useState } from 'react';
import { Link2, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cleanCode, newSyncCode, type SyncStatus } from '@/lib/demo-sync';

/** Forbind flere enheder til samme demo: scan koden med telefonen, så følger de to enheder hinanden. */
export function DemoSyncDialog({ code, status, onStart, onStop, onClose }: { code: string | null; status: SyncStatus; onStart: (code: string, host: boolean) => void; onStop: () => void; onClose: () => void }) {
  const [join, setJoin] = useState('');
  const link = code ? `${window.location.origin}/demo?kode=${code}` : '';
  async function copy() {
    try { await navigator.clipboard.writeText(link); toast.success('Linket er kopieret'); } catch { toast.error('Kunne ikke kopiere linket'); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent aria-describedby="sync-desc" className="w-[calc(100%-1.5rem)] max-w-md rounded-2xl">
        <DialogTitle className="flex items-center gap-2 text-xl"><Smartphone className="h-5 w-5 text-brass" />Forbind flere enheder</DialogTitle>
        <DialogDescription id="sync-desc">Åbn demoen på to enheder, fx gæsteappen på telefonen og personalesiden på computeren. Så følger de hinanden live.</DialogDescription>
        {code ? (
          <div className="space-y-3 text-center">
            <div className="mx-auto w-fit rounded-xl bg-white p-3"><QRCodeSVG value={link} size={168} /></div>
            <p className="text-sm text-muted-foreground">Scan med telefonen, eller skriv koden</p>
            <p className="font-display text-4xl tracking-[0.3em]" aria-label="Kode">{code}</p>
            <p className={`text-sm font-semibold ${status.connected && status.peers > 1 ? 'text-status-clean' : 'text-muted-foreground'}`} role="status">
              {!status.connected ? 'Forbinder…' : status.peers > 1 ? `${status.peers} enheder er forbundet` : 'Venter på den anden enhed…'}
            </p>
            <div className="flex justify-center gap-2"><Button variant="outline" size="sm" onClick={copy}><Link2 />Kopiér link</Button><Button variant="ghost" size="sm" onClick={() => { onStop(); }}>Stop synkronisering</Button></div>
            <p className="text-xs text-muted-foreground">Kun demoens eksempeldata deles. Alle ændringer vises på begge enheder, og "Nulstil demo" nulstiller begge.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <Button className="h-12 w-full" onClick={() => onStart(newSyncCode(), true)}>Opret kode til denne demo</Button>
            <form className="space-y-2" onSubmit={e => { e.preventDefault(); const c = cleanCode(join); if (c.length >= 4) onStart(c, false); }}>
              <label className="block text-sm font-medium">Har du en kode fra en anden enhed?
                <input value={join} onChange={e => setJoin(cleanCode(e.target.value))} placeholder="fx K7P2QX" autoCapitalize="characters" className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-lg tracking-widest" />
              </label>
              <Button type="submit" variant="outline" disabled={join.length < 4}>Forbind</Button>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
