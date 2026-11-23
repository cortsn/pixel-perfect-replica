-- Rengøring 1 gang hver 12. time, håndklæde-bytte som opgave (ikke roomservice), samt overblik over overskredne opholds-checkouts.

-- Gæst: bestil rengøring. Kun 1 gang hver 12. time. Er den forrige bestilling "ikke nået", må gæsten bestille igen med det samme.
-- Håndklæderne i bestillingen er poolhåndklæder; værelsets egne håndklæder byttes via guest_order_towels (også kun 1 gang hver 12. time).
CREATE OR REPLACE FUNCTION public.guest_request_cleaning_towels(_token uuid,_device uuid,_towel_count integer,_from timestamptz,_until timestamptz) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; _id uuid; _rep boolean;
BEGIN
  b:=require_guest(_token,_device);
  IF _towel_count IS NULL OR _towel_count<0 OR _towel_count>b.guests THEN RAISE EXCEPTION 'TOWEL_LIMIT'; END IF;
  IF (_from IS NULL) <> (_until IS NULL) OR (_from IS NOT NULL AND (_until<=_from OR _until<=now())) THEN RAISE EXCEPTION 'INVALID_WINDOW'; END IF;
  IF EXISTS(SELECT 1 FROM cleaning_requests WHERE booking_id=b.id AND status IN ('requested','in_progress')) THEN RAISE EXCEPTION 'CLEANING_ALREADY_REQUESTED'; END IF;
  IF EXISTS(SELECT 1 FROM cleaning_requests WHERE booking_id=b.id AND kind='guest' AND status<>'not_reached' AND created_at>now()-interval '12 hours') THEN RAISE EXCEPTION 'CLEANING_COOLDOWN'; END IF;
  _rep:=EXISTS(SELECT 1 FROM cleaning_requests WHERE booking_id=b.id AND status='not_reached');
  INSERT INTO cleaning_requests(booking_id,room_number,wants_towels,towel_count,away_from,away_until,is_repeat) VALUES(b.id,b.room_number,_towel_count>0,_towel_count,_from,_until,_rep) RETURNING id INTO _id;
  UPDATE rooms SET housekeeping_status='needs_cleaning',cleaning_booking_id=b.id,exchange_towels=_towel_count>0,updated_at=now() WHERE number=b.room_number;
  RETURN _id;
END $$;

-- Gæster der bor på hotellet eller er på vej. Overskredne ophold (check ud-tid passeret, men ikke tjekket ud) bliver på listen, så de kan tjekkes ud.
CREATE OR REPLACE FUNCTION public.staff_guests(_pin text) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN (SELECT coalesce(json_agg(q ORDER BY q.starts_at),'[]'::json) FROM (
    SELECT b.id,b.reference,b.room_number,b.guest_name,b.guest_email,b.guests,b.starts_at,b.ends_at,b.checked_in_at,
      coalesce((SELECT sum(i.quantity::bigint*i.unit_price_cents) FROM bill_items i WHERE i.booking_id=b.id AND i.voided_at IS NULL),0) AS balance_cents,
      (b.starts_at<=now() AND b.ends_at>now()) AS in_house,
      (b.starts_at<=now() AND b.ends_at<=now()) AS overdue
    FROM bookings b WHERE b.active AND b.checked_out_at IS NULL AND b.ends_at>now()-interval '7 days') q);
END $$;

-- Værelsesoversigt med nuværende gæst og evt. overskredet ophold.
CREATE OR REPLACE FUNCTION public.staff_rooms(_pin text) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN (SELECT coalesce(json_agg(q ORDER BY q.number),'[]'::json) FROM (
    SELECT r.number,r.floor,r.capacity,r.housekeeping_status,r.rate_cents,
      cur.guest_name,cur.id AS booking_id,cur.ends_at,cur.guests,cur.reference,
      ov.id AS overdue_booking_id,ov.guest_name AS overdue_guest
    FROM rooms r
    LEFT JOIN LATERAL (SELECT b.id,b.guest_name,b.ends_at,b.guests,b.reference FROM bookings b WHERE b.room_number=r.number AND b.active AND b.checked_out_at IS NULL AND b.starts_at<=now() AND b.ends_at>now() ORDER BY b.starts_at DESC LIMIT 1) cur ON true
    LEFT JOIN LATERAL (SELECT b.id,b.guest_name FROM bookings b WHERE b.room_number=r.number AND b.active AND b.checked_out_at IS NULL AND b.starts_at<=now() AND b.ends_at<=now() AND b.ends_at>now()-interval '7 days' ORDER BY b.ends_at DESC LIMIT 1) ov ON true) q);
END $$;

-- Dashboard: roomserviceordrer tælles for sig; håndklæde-bytte er en opgave sammen med rengøring.
CREATE OR REPLACE FUNCTION public.staff_dashboard(_pin text) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE today date:=(now() AT TIME ZONE 'Europe/Copenhagen')::date; total_rooms integer; occupied integer;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT count(*) INTO total_rooms FROM rooms;
  SELECT count(DISTINCT room_number) INTO occupied FROM bookings WHERE active AND checked_out_at IS NULL AND starts_at<=now() AND ends_at>now();
  RETURN json_build_object(
    'arrivals',(SELECT coalesce(json_agg(q ORDER BY q.starts_at),'[]'::json) FROM (SELECT id,room_number,guest_name,guests,starts_at,checked_in_at FROM bookings WHERE active AND checked_out_at IS NULL AND (starts_at AT TIME ZONE 'Europe/Copenhagen')::date=today) q),
    'departures',(SELECT coalesce(json_agg(q ORDER BY q.ends_at),'[]'::json) FROM (SELECT id,room_number,guest_name,guests,ends_at,checked_out_at FROM bookings WHERE active AND starts_at<=now() AND ((checked_out_at IS NULL AND (ends_at AT TIME ZONE 'Europe/Copenhagen')::date<=today AND ends_at>now()-interval '7 days') OR (checked_out_at AT TIME ZONE 'Europe/Copenhagen')::date=today)) q),
    'rooms_total',total_rooms,'occupied',occupied,'free',greatest(total_rooms-occupied,0),
    'rooms_to_clean',(SELECT count(*) FROM rooms WHERE housekeeping_status IN ('needs_cleaning','cleaning')),
    'open_tasks',(SELECT count(*) FROM cleaning_requests WHERE status IN ('requested','in_progress'))+(SELECT count(*) FROM orders WHERE type='towels' AND NOT cancelled AND status IN ('pending','accepted','in_progress','ready')),
    'new_orders',(SELECT count(*) FROM orders WHERE type='room_service' AND status='pending' AND NOT cancelled),
    'open_orders',(SELECT count(*) FROM orders WHERE type='room_service' AND status IN ('pending','accepted','in_progress','ready') AND NOT cancelled),
    'revenue_today_cents',coalesce((SELECT sum(quantity::bigint*unit_price_cents) FROM bill_items WHERE voided_at IS NULL AND (created_at AT TIME ZONE 'Europe/Copenhagen')::date=today),0),
    'unsettled_cents',coalesce((SELECT sum(i.quantity::bigint*i.unit_price_cents) FROM bill_items i JOIN bookings b ON b.id=i.booking_id WHERE i.voided_at IS NULL AND NOT i.paid AND b.checked_out_at IS NULL),0));
END $$;

DO $$ DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND (p.proname LIKE 'staff\_%' OR p.proname='guest_request_cleaning_towels')
  LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION '||f.sig||' FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION '||f.sig||' TO anon,authenticated';
  END LOOP;
END $$;
