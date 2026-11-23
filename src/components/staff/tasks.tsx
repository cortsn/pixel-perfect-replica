import { StaffRequests } from '@/components/hotel/staff-requests';
import { TowelTasks } from '@/components/staff/towel-tasks';
import { PageTitle, useStaff } from '@/components/staff/core';

/** Opgaver & rengøring: rengøring (gæstens bestillinger og automatiske afrejse-opgaver) og håndklæder. */
export function TasksSection({ page }: { page: string }) {
  const { pin } = useStaff();
  return page === 'towels'
    ? <><PageTitle title="Håndklæder" hint="Gæstens bestillinger af håndklæder. De byttes og leveres til værelset." /><TowelTasks /></>
    : <><PageTitle title="Rengøring" hint="Gæstens bestillinger og afrejse-rengøring. Efter en checkout oprettes rengøringen automatisk." /><StaffRequests pin={pin} /></>;
}
