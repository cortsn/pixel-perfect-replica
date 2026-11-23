import { StaffRequests } from '@/components/hotel/staff-requests';
import { TowelTasks } from '@/components/staff/towel-tasks';
import { PageTitle, useStaff } from '@/components/staff/core';

/** Opgaver: rengøring (gæstens bestillinger og automatiske afrejse-opgaver) og håndklæde-bytte. */
export function TasksPage() {
  const { pin } = useStaff();
  return (
    <>
      <PageTitle title="Opgaver" hint="Rengøring og håndklæde-bytte. Efter en checkout oprettes afrejse-rengøringen automatisk." />
      <div className="grid gap-8 xl:grid-cols-2">
        <StaffRequests pin={pin} />
        <TowelTasks />
      </div>
    </>
  );
}
