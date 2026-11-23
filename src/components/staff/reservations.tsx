import { PmsPanel } from '@/components/hotel/pms-panel';
import { StaffStays } from '@/components/hotel/staff-stays';
import { PageTitle, card, useStaff, useStaffData } from '@/components/staff/core';

type RoomLite = { number: string };

/** Reservationer: nye bookinger (PMS-simulation) og ændring af opholdets start- og sluttid. */
export function ReservationsPage() {
  const { pin } = useStaff();
  const rooms = useStaffData<RoomLite[]>('staff_rooms');
  return (
    <>
      <PageTitle title="Reservationer" hint="Opret bookinger og ret start- og sluttid. Gæsten får besked om ændringer." />
      <div className={`${card} mb-6`}><StaffStays pin={pin} /></div>
      <div className={`${card} p-0`}><PmsPanel pin={pin} rooms={(rooms.data ?? []).map(r => r.number)} /></div>
    </>
  );
}
