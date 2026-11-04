-- Rengøringsbestillinger med tidsrum, "ikke nået" og gen-bestilling, samt tidlig check-in.

ALTER TABLE public.bookings
  ADD COLUMN early_checkin_time timestamptz,
  ADD COLUMN early_checkin_status text CHECK (early_checkin_status IN ('requested','approved','declined'));

CREATE TABLE public.cleaning_requests(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  room_number text NOT NULL,
  wants_towels boolean NOT NULL DEFAULT false,
  away_from timestamptz,
  away_until timestamptz,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','in_progress','done','not_reached')),
  is_repeat boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((away_from IS NULL) = (away_until IS NULL))
);
GRANT ALL ON public.cleaning_requests TO service_role;
ALTER TABLE public.cleaning_requests ENABLE ROW LEVEL SECURITY;

-- Gæst: bestil rengøring (valgfrit tidsrum, hvor gæsten ikke er på værelset)
CREATE OR REPLACE FUNCTION public.guest_request_cleaning_window(_token uuid,_device uuid,_towels boolean,_from timestamptz,_until timestamptz) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; _id uuid; _rep boolean;
BEGIN
  b:=require_guest(_token,_device);
  IF (_from IS NULL) <> (_until IS NULL) OR (_from IS NOT NULL AND (_until<=_from OR _until<=now())) THEN RAISE EXCEPTION 'INVALID_WINDOW'; END IF;
  IF EXISTS(SELECT 1 FROM cleaning_requests WHERE booking_id=b.id AND status IN ('requested','in_progress')) THEN RAISE EXCEPTION 'CLEANING_ALREADY_REQUESTED'; END IF;
  _rep:=EXISTS(SELECT 1 FROM cleaning_requests WHERE booking_id=b.id AND status='not_reached');
  INSERT INTO cleaning_requests(booking_id,room_number,wants_towels,away_from,away_until,is_repeat) VALUES(b.id,b.room_number,coalesce(_towels,false),_from,_until,_rep) RETURNING id INTO _id;
  UPDATE rooms SET housekeeping_status='needs_cleaning',cleaning_booking_id=b.id,exchange_towels=coalesce(_towels,false),updated_at=now() WHERE number=b.room_number;
  RETURN _id;
END $$;

-- Gæst: seneste rengøringsbestilling og tidlig check-in (virker også før opholdet starter)
CREATE OR REPLACE FUNCTION public.guest_extras(_token uuid,_device uuid) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings;
BEGIN
  b:=require_guest(_token,_device,false);
  RETURN json_build_object(
    'cleaning',(SELECT row_to_json(q) FROM (SELECT id,status,wants_towels,away_from,away_until,is_repeat,created_at FROM cleaning_requests WHERE booking_id=b.id ORDER BY created_at DESC LIMIT 1) q),
    'early',CASE WHEN b.early_checkin_status IS NULL THEN NULL ELSE json_build_object('time',b.early_checkin_time,'status',b.early_checkin_status) END
  );
END $$;

-- Gæst: anmod om tidlig check-in
CREATE OR REPLACE FUNCTION public.guest_request_early_checkin(_token uuid,_device uuid,_time timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings;
BEGIN
  b:=require_guest(_token,_device,false);
  IF now()>=b.starts_at THEN RAISE EXCEPTION 'EARLY_NOT_APPLICABLE'; END IF;
  IF b.early_checkin_status='approved' THEN RAISE EXCEPTION 'EARLY_ALREADY_APPROVED'; END IF;
  IF _time IS NULL OR _time>=b.starts_at OR _time<b.starts_at-interval '12 hours' OR _time<now()-interval '5 minutes' THEN RAISE EXCEPTION 'INVALID_TIME'; END IF;
  UPDATE bookings SET early_checkin_time=_time,early_checkin_status='requested' WHERE id=b.id;
END $$;

-- Personale: rengøringskø og tidlige check-ins
CREATE OR REPLACE FUNCTION public.staff_cleaning(_pin text) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN json_build_object(
    'requests',(SELECT coalesce(json_agg(q),'[]'::json) FROM (
      SELECT c.id,c.room_number,b.guest_name,c.wants_towels,c.away_from,c.away_until,c.status,c.is_repeat,c.created_at,c.updated_at
      FROM cleaning_requests c JOIN bookings b ON b.id=c.booking_id
      WHERE c.status IN ('requested','in_progress') OR c.updated_at>now()-interval '12 hours'
      ORDER BY c.created_at DESC LIMIT 100) q),
    'early',(SELECT coalesce(json_agg(q),'[]'::json) FROM (
      SELECT b.id,b.reference,b.room_number,b.guest_name,b.starts_at,b.early_checkin_time,b.early_checkin_status,r.housekeeping_status
      FROM bookings b JOIN rooms r ON r.number=b.room_number
      WHERE b.active AND b.early_checkin_status IS NOT NULL AND b.ends_at>now()
      ORDER BY coalesce(b.early_checkin_time,b.starts_at) LIMIT 50) q)
  );
END $$;

-- Personale: sæt status på en rengøringsbestilling (i gang / færdig / ikke nået)
CREATE OR REPLACE FUNCTION public.staff_set_cleaning(_pin text,_request uuid,_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _room text;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _status NOT IN ('in_progress','done','not_reached') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  UPDATE cleaning_requests SET status=_status,updated_at=now() WHERE id=_request AND status IN ('requested','in_progress') RETURNING room_number INTO _room;
  IF _room IS NULL THEN RAISE EXCEPTION 'REQUEST_CLOSED'; END IF;
  UPDATE rooms SET
    housekeeping_status=CASE _status WHEN 'in_progress' THEN 'cleaning' WHEN 'done' THEN 'clean' ELSE 'occupied' END,
    cleaning_booking_id=CASE WHEN _status='not_reached' THEN NULL ELSE cleaning_booking_id END,
    exchange_towels=CASE WHEN _status='not_reached' THEN false ELSE exchange_towels END,
    updated_at=now()
  WHERE number=_room;
END $$;

-- Personale: godkend eller afvis tidlig check-in. Godkendt flytter opholdets start frem.
CREATE OR REPLACE FUNCTION public.staff_set_early_checkin(_pin text,_booking uuid,_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _status NOT IN ('approved','declined') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  SELECT * INTO b FROM bookings WHERE id=_booking AND early_checkin_status IS NOT NULL AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_CLOSED'; END IF;
  IF _status='approved' THEN
    IF EXISTS(SELECT 1 FROM bookings o WHERE o.id<>b.id AND o.room_number=b.room_number AND o.active AND o.starts_at<b.ends_at AND o.ends_at>b.early_checkin_time) THEN RAISE EXCEPTION 'ROOM_BUSY'; END IF;
    UPDATE bookings SET early_checkin_status='approved',starts_at=least(starts_at,early_checkin_time) WHERE id=b.id;
  ELSE
    UPDATE bookings SET early_checkin_status='declined' WHERE id=b.id;
  END IF;
END $$;

-- Rummets status følger med, når personalet sætter den direkte på rummet
CREATE OR REPLACE FUNCTION public.staff_set_room_status(_pin text,_room text,_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _status NOT IN ('occupied','needs_cleaning','cleaning','clean') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  UPDATE rooms SET housekeeping_status=_status,updated_at=now(),cleaning_booking_id=CASE WHEN _status='occupied' THEN NULL ELSE cleaning_booking_id END,exchange_towels=CASE WHEN _status='occupied' THEN false ELSE exchange_towels END WHERE number=_room;
  IF _status IN ('cleaning','clean') THEN
    UPDATE cleaning_requests SET status=CASE _status WHEN 'cleaning' THEN 'in_progress' ELSE 'done' END,updated_at=now() WHERE room_number=_room AND status IN ('requested','in_progress');
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.guest_request_cleaning_window(uuid,uuid,boolean,timestamptz,timestamptz),public.guest_extras(uuid,uuid),public.guest_request_early_checkin(uuid,uuid,timestamptz),public.staff_cleaning(text),public.staff_set_cleaning(text,uuid,text),public.staff_set_early_checkin(text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_request_cleaning_window(uuid,uuid,boolean,timestamptz,timestamptz),public.guest_extras(uuid,uuid),public.guest_request_early_checkin(uuid,uuid,timestamptz),public.staff_cleaning(text),public.staff_set_cleaning(text,uuid,text),public.staff_set_early_checkin(text,uuid,text),public.staff_set_room_status(text,text,text) TO anon,authenticated;
