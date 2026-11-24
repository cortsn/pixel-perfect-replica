-- Rum-klar-advarsel ved tjek ind og seneste rengøring/håndklædebytte pr. værelse.
-- room_status: værelsets rengøringsstatus. last_cleaned_at: seneste afsluttede rengøring.
-- last_towels_swapped_at: seneste rengøring, hvor værelsets håndklæder blev byttet. last_pool_towels_at: seneste leverede poolhåndklæder.
CREATE OR REPLACE FUNCTION public.staff_room_care(_pin text,_room text) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN json_build_object(
    'room_status',(SELECT r.housekeeping_status FROM rooms r WHERE r.number=_room),
    'last_cleaned_at',(SELECT max(c.updated_at) FROM cleaning_requests c WHERE c.room_number=_room AND c.status='done'),
    'last_towels_swapped_at',(SELECT max(c.updated_at) FROM cleaning_requests c WHERE c.room_number=_room AND c.status='done' AND c.wants_towels),
    'last_pool_towels_at',(SELECT max(o.updated_at) FROM orders o WHERE o.room_number=_room AND o.type='towels' AND NOT o.cancelled AND o.status='done'));
END $$;

CREATE OR REPLACE FUNCTION public.staff_guests(_pin text) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN (SELECT coalesce(json_agg(q ORDER BY q.starts_at),'[]'::json) FROM (
    SELECT b.id,b.reference,b.room_number,b.guest_name,b.guest_email,b.guests,b.starts_at,b.ends_at,b.checked_in_at,
      coalesce((SELECT sum(i.quantity::bigint*i.unit_price_cents) FROM bill_items i WHERE i.booking_id=b.id AND i.voided_at IS NULL AND NOT i.paid),0) AS balance_cents,
      coalesce((SELECT sum(i.quantity::bigint*i.unit_price_cents) FROM bill_items i WHERE i.booking_id=b.id AND i.voided_at IS NULL AND NOT i.paid),0) AS due_cents,
      coalesce((SELECT sum(i.quantity::bigint*i.unit_price_cents) FROM bill_items i WHERE i.booking_id=b.id AND i.voided_at IS NULL),0) AS total_cents,
      (SELECT count(*) FROM orders o WHERE o.booking_id=b.id AND o.type='room_service' AND NOT o.cancelled AND o.status IN ('pending','accepted','in_progress','ready'))::integer AS open_orders,
      (b.starts_at<=now() AND b.ends_at>now()) AS in_house,
      (b.starts_at<=now() AND b.ends_at<=now()) AS overdue,
      (SELECT r.housekeeping_status FROM rooms r WHERE r.number=b.room_number) AS room_status,
      (SELECT max(c.updated_at) FROM cleaning_requests c WHERE c.room_number=b.room_number AND c.status='done') AS last_cleaned_at,
      (SELECT max(c.updated_at) FROM cleaning_requests c WHERE c.room_number=b.room_number AND c.status='done' AND c.wants_towels) AS last_towels_swapped_at,
      (SELECT max(o.updated_at) FROM orders o WHERE o.room_number=b.room_number AND o.type='towels' AND NOT o.cancelled AND o.status='done') AS last_pool_towels_at
    FROM bookings b WHERE b.active AND b.checked_out_at IS NULL AND b.ends_at>now()-interval '7 days') q);
END $$;

DO $$ DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname IN ('staff_room_care','staff_guests')
  LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION '||f.sig||' FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION '||f.sig||' TO anon,authenticated';
  END LOOP;
END $$;
