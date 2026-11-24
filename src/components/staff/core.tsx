import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { BarChart3, BedDouble, ClipboardCheck, ConciergeBell, Megaphone, LayoutDashboard, Receipt, Settings, Users, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { rpc, subscribeRpcChanges } from '@/lib/cleaning';
import { errorText } from '@/lib/hotel';

export type Section = 'dashboard' | 'guests' | 'rooms' | 'tasks' | 'announcements' | 'orders' | 'sales' | 'stats' | 'services' | 'settings';
export type NavPage = { id: string; label: string };
export type NavItem = { id: Section; label: string; icon: LucideIcon; pages?: NavPage[] };
/** Sidebaren: logiske grupper. Grupper med undersider åbnes som dropdown. */
export const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'guests', label: 'Gæster & ophold', icon: Users, pages: [{ id: 'overview', label: 'Gæster' }, { id: 'arrivals', label: 'Ankomster & afrejser' }, { id: 'reservations', label: 'Reservationer & tider' }] },
  { id: 'rooms', label: 'Værelser', icon: BedDouble },
  { id: 'tasks', label: 'Opgaver', icon: ClipboardCheck },
  { id: 'announcements', label: 'Beskeder til gæster', icon: Megaphone },
  { id: 'orders', label: 'Ordrer', icon: UtensilsCrossed },
  { id: 'sales', label: 'Salg & regninger', icon: Receipt, pages: [{ id: 'new', label: 'Nyt salg' }, { id: 'bills', label: 'Regninger' }, { id: 'history', label: 'Historik' }] },
  { id: 'stats', label: 'Statistik', icon: BarChart3, pages: [{ id: 'overview', label: 'Oversigt' }, { id: 'reviews', label: 'Anmeldelser' }] },
  { id: 'services', label: 'Hotellets services', icon: ConciergeBell, pages: [{ id: 'menu', label: 'Roomservice-menu' }, { id: 'hours', label: 'Åbningstider' }] },
  { id: 'settings', label: 'Indstillinger', icon: Settings, pages: [{ id: 'general', label: 'Generelt' }, { id: 'features', label: 'Funktioner' }, { id: 'staff', label: 'Medarbejdere' }, { id: 'prices', label: 'Værelsespriser' }] },
];
const LEGACY: Record<string, [Section, string?]> = { roomservice: ['orders'], reservations: ['guests', 'reservations'], staff: ['settings', 'staff'] };
/** Finder gruppe og underside ud fra adressen. Gamle adresser (fx ?s=roomservice) virker stadig. */
export function resolveNav(s?: string, p?: string): { section: Section; page: string } {
  const legacy = s ? LEGACY[s] : undefined;
  const id = (legacy?.[0] ?? s) as Section;
  const item = NAV.find(n => n.id === id) ?? NAV[0]!;
  const wanted = p ?? legacy?.[1];
  const page = item.pages?.some(x => x.id === wanted) ? wanted! : item.pages?.[0]?.id ?? '';
  return { section: item.id, page };
}

export type Dash = {
  arrivals: { id: string; room_number: string; guest_name: string; guests: number; starts_at: string; checked_in_at: string | null }[];
  departures: { id: string; room_number: string; guest_name: string; guests: number; ends_at: string; checked_out_at: string | null }[];
  rooms_total: number; occupied: number; free: number; rooms_to_clean: number; open_tasks: number; new_orders: number; open_orders: number;
  revenue_today_cents: number; unsettled_cents: number;
};
export type Me = { name: string; role: 'manager' | 'reception' | 'kitchen' | 'housekeeping' };
export const ROLE_LABELS: Record<Me['role'], string> = { manager: 'Leder', reception: 'Reception', kitchen: 'Køkken', housekeeping: 'Rengøring' };

type Ctx = { pin: string; me: Me | null; dash: Dash | null; reloadDash: () => void; go: (s: Section, page?: string) => void; openBill: (bookingId: string) => void; openGuest: (bookingId: string) => void; openCheckout: (bookingId: string) => void };
const StaffCtx = createContext<Ctx | null>(null);
export const StaffProvider = StaffCtx.Provider;
export function useStaff() {
  const c = useContext(StaffCtx);
  if (!c) throw new Error('useStaff uden for StaffProvider');
  return c;
}

/** Henter data med personalets kode og opdaterer jævnligt. `extra` er flere RPC-argumenter. */
export function useStaffData<T>(name: string, extra: Record<string, unknown> = {}, intervalMs = 0) {
  const { pin } = useStaff();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(extra);
  const extraRef = useRef(extra);
  extraRef.current = extra;
  const load = useCallback(async () => {
    const { data: d, error: e } = await rpc<T>(name, { _pin: pin, ...extraRef.current });
    setLoading(false);
    if (e) { setError(errorText(e)); return; }
    setError(null);
    setData(d);
  }, [name, pin, key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void load();
    const unsub = subscribeRpcChanges(() => { void load(); }); // demo: opdater med det samme, når noget ændres
    if (!intervalMs) return () => { unsub?.(); };
    const t = setInterval(() => { if (!document.hidden) void load(); }, intervalMs);
    return () => { clearInterval(t); unsub?.(); };
  }, [load, intervalMs]);
  return { data, error, loading, reload: load };
}

/** Kalder en personale-funktion, viser fejl som toast og (valgfrit) en succesbesked. */
export function useAct() {
  const { pin, reloadDash } = useStaff();
  return useCallback(async <T = unknown>(name: string, args: Record<string, unknown> = {}, success?: string): Promise<{ ok: boolean; data: T | null }> => {
    const { data, error } = await rpc<T>(name, { _pin: pin, ...args });
    if (error) { toast.error(errorText(error)); return { ok: false, data: null }; }
    if (success) toast.success(success);
    reloadDash();
    return { ok: true, data };
  }, [pin, reloadDash]);
}

/** Værdien opdateres først, når der har været stille et øjeblik (til søgefelter). */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export const card = 'rounded-xl border bg-card p-4 shadow-sm';
export const field = 'w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function PageTitle({ title, hint, actions }: { title: string; hint?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-3xl">{title}</h1>{hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone, onClick, icon: Icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'warn' | 'ok'; onClick?: () => void; icon?: LucideIcon }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{label}</p>{Icon && <Icon className="h-4 w-4 text-muted-foreground" />}</div>
      <p className={`mt-2 font-display text-4xl leading-none tabular-nums ${tone === 'warn' ? 'text-status-dirty' : tone === 'ok' ? 'text-status-clean' : ''}`}>{value}</p>
      {sub && <p className="mt-2 text-xs text-muted-foreground">{sub}</p>}
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className={`${card} text-left transition hover:bg-accent`}>{body}</button>
    : <div className={card}>{body}</div>;
}

export const hm = (iso: string) => new Date(iso).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
export const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
export const dayTime = (iso: string) => new Date(iso).toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
