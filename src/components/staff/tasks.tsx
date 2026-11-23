import { StaffRequests } from '@/components/hotel/staff-requests';
import { PageTitle, useStaff } from '@/components/staff/core';

/** Opgaver: rengøring (gæstens bestillinger og automatiske afrejse-opgaver efter checkout). */
export function TasksPage() {
  const { pin } = useStaff();
  return (
    <>
      <PageTitle title="Opgaver" hint="Rengøring. Efter en checkout oprettes afrejse-rengøringen automatisk." />
      <StaffRequests pin={pin} />
    </>
  );
}
