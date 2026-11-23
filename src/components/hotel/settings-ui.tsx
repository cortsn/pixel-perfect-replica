import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Byggeklodser til en liste som iPhonens Indstillinger: grupper af rækker, der åbner en underside. */

export type RowTone = 'primary' | 'brass' | 'forest' | 'clean' | 'cleaning' | 'dirty';
const TONES: Record<RowTone, string> = {
  primary: 'bg-primary text-primary-foreground',
  brass: 'bg-brass text-accent-foreground',
  forest: 'bg-forest text-forest-foreground',
  clean: 'bg-status-clean text-white',
  cleaning: 'bg-status-cleaning text-foreground',
  dirty: 'bg-status-dirty text-white',
};

export function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section>
      {title && <h2 className="eyebrow mb-2 px-4 font-sans text-muted-foreground">{title}</h2>}
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">{children}</ul>
    </section>
  );
}

export function SettingsRow({ Icon, tone = 'primary', title, value, badge, onClick }: { Icon: LucideIcon; tone?: RowTone | undefined; title: string; value?: string | undefined; badge?: number | undefined; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-accent active:bg-accent">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONES[tone]}`}><Icon className="h-[18px] w-[18px]" /></span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{title}</span>
        {value && <span className="max-w-[45%] truncate text-sm text-muted-foreground">{value}</span>}
        {badge ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-status-dirty px-1.5 text-xs font-semibold text-white" aria-label={`${badge} aktive`}>{badge}</span> : null}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}

/** Fuldskærmsside, der glider ind over listen, med tilbage-knap øverst. Respekterer iPhones notch og hjemmelinje. */
export function SubPage({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background" role="dialog" aria-modal="true" aria-label={title}>
      <header className="sticky top-0 z-10 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-[1fr_auto_1fr] items-center px-2 py-2">
          <button type="button" onClick={onBack} className="flex items-center gap-0.5 justify-self-start rounded-md py-2 pl-1 pr-3 text-[15px] font-medium text-primary">
            <ChevronLeft className="h-5 w-5" />Tilbage
          </button>
          <h1 className="text-center text-base font-semibold">{title}</h1>
          <span />
        </div>
      </header>
      <div className="mx-auto max-w-md space-y-4 px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-4">{children}</div>
    </div>
  );
}

/** Hvidt kort inde på en underside. */
export function PageCard({ children }: { children: ReactNode }) {
  return <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">{children}</div>;
}
