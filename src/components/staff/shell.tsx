import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LogOut, Menu } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { isDemoBackend, rpc, subscribeRpcChanges } from '@/lib/cleaning';
import { PageBoundary } from '@/components/staff/boundary';
import { Logo } from '@/components/hotel/logo';
import { ROLE_LABELS, SECTIONS, StaffProvider, type Dash, type Me, type Section } from '@/components/staff/core';
import { BillDialog } from '@/components/staff/bill-dialog';
import { DashboardPage } from '@/components/staff/dashboard';
import { GuestsPage } from '@/components/staff/guests';
import { ReservationsPage } from '@/components/staff/reservations';
import { RoomsPage } from '@/components/staff/rooms';
import { TasksPage } from '@/components/staff/tasks';
import { SalesPage } from '@/components/staff/sales';
import { RoomServicePage } from '@/components/staff/roomservice';
import { StatsPage } from '@/components/staff/stats';
import { MembersPage } from '@/components/staff/members';
import { SettingsPage } from '@/components/staff/settings';

function NavList({ section, dash, onPick }: { section: Section; dash: Dash | null; onPick: (s: Section) => void }) {
  const badge = (s: Section) => (s === 'roomservice' ? dash?.new_orders : s === 'tasks' ? dash?.open_tasks : 0) ?? 0;
  return (
    <nav aria-label="Hovedmenu" className="space-y-0.5">
      {SECTIONS.map(({ id, label, icon: Icon }) => {
        const n = badge(id);
        return (
          <button key={id} type="button" onClick={() => onPick(id)} aria-current={section === id ? 'page' : undefined}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${section === id ? 'bg-forest-foreground/15 font-semibold text-forest-foreground' : 'text-forest-foreground/75 hover:bg-forest-foreground/10 hover:text-forest-foreground'}`}>
            <Icon className="h-[18px] w-[18px] shrink-0" />
            <span className="flex-1">{label}</span>
            {n > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-status-dirty px-1.5 text-xs font-semibold text-white" aria-label={`${n} nye`}>{n}</span>}
          </button>
        );
      })}
    </nav>
  );
}

function Sidebar({ section, dash, me, onPick, onLogout }: { section: Section; dash: Dash | null; me: Me | null; onPick: (s: Section) => void; onLogout: () => void }) {
  return (
    <div className="flex h-full flex-col bg-forest p-3 text-forest-foreground">
      <div className="px-3 pb-5 pt-4"><Logo size={30} /><p className="eyebrow mt-3 text-brass">Personale</p></div>
      <div className="flex-1 overflow-y-auto"><NavList section={section} dash={dash} onPick={onPick} /></div>
      <div className="mt-3 border-t border-forest-foreground/15 px-3 pt-3">
        {me && <p className="text-sm font-semibold">{me.name}</p>}
        {me && <p className="text-xs text-forest-foreground/60">{ROLE_LABELS[me.role]}</p>}
        <Button onClick={onLogout} variant="ghost" size="sm" className="-ml-3 mt-1 text-forest-foreground/75 hover:bg-forest-foreground/10 hover:text-forest-foreground"><LogOut />Log ud</Button>
      </div>
    </div>
  );
}

/** Personalesiden: fast sidebar til venstre, klæbende topbar og hovedområde. */
export function StaffShell({ pin, section, onSection, onLogout, demoBar }: { pin: string; section: Section; onSection: (s: Section) => void; onLogout: () => void; demoBar?: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [dash, setDash] = useState<Dash | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [billFor, setBillFor] = useState<string | null>(null);

  const reloadDash = useCallback(async () => {
    const { data } = await rpc<Dash>('staff_dashboard', { _pin: pin });
    if (data) setDash(data);
  }, [pin]);
  useEffect(() => {
    void rpc<Me>('staff_who', { _pin: pin }).then(({ data }) => data && setMe(data));
    void reloadDash();
    const t = setInterval(() => { if (!document.hidden) void reloadDash(); }, 10000);
    if (isDemoBackend()) {
      // Demo: lyt på den lokale database, og vis en besked, når en ny ordre kommer ind (fx fra gæstesiden).
      const seen = new Set<string>();
      let first = true;
      const check = async () => {
        const { data } = await rpc<{ id: string; room_number: string; type: string; details: string; status: string }[]>('staff_orders', { _pin: pin, _limit: 30 });
        if (!data) return;
        data.forEach((o) => {
          if (!seen.has(o.id) && !first && o.status === 'pending') toast(`Ny bestilling · Værelse ${o.room_number}`, { description: o.type === 'towels' ? 'Håndklæder' : o.details });
          seen.add(o.id);
        });
        first = false;
      };
      void check();
      const unsub = subscribeRpcChanges(() => { void check(); void reloadDash(); });
      return () => { clearInterval(t); unsub?.(); };
    }
    // Ny roomserviceordre: besked med det samme (også mens man er på en anden side).
    const ch = supabase.channel(`staff-shell-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (p) => {
        const o = p.new as { room_number: string; type: string; details: string };
        toast(`Ny bestilling · Værelse ${o.room_number}`, { description: o.type === 'towels' ? 'Håndklæder' : o.details });
        void reloadDash();
      })
      .subscribe();
    return () => { clearInterval(t); void supabase.removeChannel(ch); };
  }, [pin, reloadDash]);

  const go = useCallback((s: Section) => { onSection(s); setMenuOpen(false); window.scrollTo({ top: 0 }); }, [onSection]);
  const ctx = useMemo(() => ({ pin, me, dash, reloadDash: () => { void reloadDash(); }, go, openBill: setBillFor }), [pin, me, dash, reloadDash, go]);
  const title = SECTIONS.find(s => s.id === section)?.label ?? '';

  return (
    <StaffProvider value={ctx}>
      <div className="min-h-screen bg-background">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 lg:block"><Sidebar section={section} dash={dash} me={me} onPick={go} onLogout={onLogout} /></aside>
        <div className="lg:pl-60">
          {demoBar}
          <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-3 border-b bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:px-8">
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Åbn menu" onClick={() => setMenuOpen(true)}><Menu /></Button>
            <span className="font-display text-xl lg:hidden">{title}</span>
            <span className="hidden text-sm text-muted-foreground lg:inline">HotelPilot · {title}</span>
            <span className="ml-auto flex items-center gap-2 text-sm text-muted-foreground"><span className="h-2 w-2 animate-pulse rounded-full bg-status-clean" />Live</span>
          </header>
          <main className="mx-auto max-w-7xl p-4 pb-16 lg:p-8">
            <PageBoundary resetKey={section}>
            {section === 'dashboard' && <DashboardPage />}
            {section === 'guests' && <GuestsPage />}
            {section === 'reservations' && <ReservationsPage />}
            {section === 'rooms' && <RoomsPage />}
            {section === 'tasks' && <TasksPage />}
            {section === 'sales' && <SalesPage />}
            {section === 'roomservice' && <RoomServicePage />}
            {section === 'stats' && <StatsPage />}
            {section === 'staff' && <MembersPage />}
            {section === 'settings' && <SettingsPage onLogout={onLogout} />}
            </PageBoundary>
          </main>
        </div>
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="left" className="w-72 border-0 p-0">
            <SheetTitle className="sr-only">Menu</SheetTitle><SheetDescription className="sr-only">Vælg en side</SheetDescription>
            <Sidebar section={section} dash={dash} me={me} onPick={go} onLogout={onLogout} />
          </SheetContent>
        </Sheet>
        {billFor && <BillDialog bookingId={billFor} onClose={() => setBillFor(null)} />}
      </div>
    </StaffProvider>
  );
}
