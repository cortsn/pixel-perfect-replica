import { MenuAdmin } from '@/components/staff/menu-admin';
import { PageTitle } from '@/components/staff/core';

/** Hotellets services: roomservice-menuen og åbningstider. Ændringer vises med det samme i gæsteappen. */
export function ServicesSection({ page }: { page: string }) {
  return page === 'hours'
    ? <><PageTitle title="Åbningstider" hint="Uden for åbningstiden kan gæsterne ikke bestille roomservice." /><MenuAdmin part="hours" /></>
    : <><PageTitle title="Roomservice-menu" hint="Kategorier, varer, priser, varianter og tilvalg. Ændringer vises med det samme i gæsteappen." /><MenuAdmin part="menu" /></>;
}
