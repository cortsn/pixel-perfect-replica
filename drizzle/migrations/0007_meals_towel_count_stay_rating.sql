-- Måltider (morgenmad/frokost/aftensmad), antal håndklæder ved rengøring og rating efter opholdet.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS breakfast_choice text CHECK (breakfast_choice IN ('hotel','out')),
  ADD COLUMN IF NOT EXISTS lunch_choice text CHECK (lunch_choice IN ('hotel','out'));

ALTER TABLE public.cleaning_requests ADD COLUMN IF NOT EXISTS towel_count integer NOT NULL DEFAULT 0 CHECK (towel_count >= 0);
UPDATE public.cleaning_requests SET towel_count=1 WHERE wants_towels AND towel_count=0;

-- Gæst: vælg om du spiser på hotellet til et måltid. 'none' fjerner valget igen.
CREATE OR REPLACE FUNCTION public.guest_meal(_token uuid,_device uuid,_meal text,_choice text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; v text;
BEGIN
  b:=require_guest(_token,_device);
  IF _meal NOT IN ('breakfast','lunch','dinner') OR _choice NOT IN ('hotel','out','none') THEN RAISE EXCEPTION 'INVALID_CHOICE'; END IF;
  v:=CASE WHEN _choice='none' THEN NULL ELSE _choice END;
  UPDATE bookings SET
    breakfast_choice=CASE WHEN _meal='breakfast' THEN v ELSE breakfast_choice END,
    lunch_choice=CASE WHEN _meal='lunch' THEN v ELSE lunch_choice END,
    dinner_choice=CASE WHEN _meal='dinner' THEN v ELSE dinner_choice END
  WHERE id=b.id;
END $$;

-- Gæstesessionen får måltidsvalg. Håndklæde-grænsen (towel_limit) er nu antal personer pr. bytning.
CREATE OR REPLACE FUNCTION public.guest_info(_b bookings,_device uuid) RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT json_build_object('access_token',_b.access_token,'device_id',_device,'guest_name',_b.guest_name,'room_number',_b.room_number,'reference',_b.reference,'capacity',r.capacity,'guests',_b.guests,'towel_limit',_b.guests,'towels_used',towels_used(_b.id),'max_devices',_b.guests+2,'devices',(SELECT count(*) FROM devices d WHERE d.booking_id=_b.id),'housekeeping_status',CASE WHEN r.cleaning_booking_id=_b.id THEN r.housekeeping_status ELSE 'occupied' END,
 'wifi_ssid',CASE WHEN now()>=_b.starts_at AND now()<_b.ends_at AND _b.active AND _b.checked_in_at IS NOT NULL THEN (SELECT value FROM hotel_secrets WHERE key='wifi_ssid') END,
 'wifi_password',CASE WHEN now()>=_b.starts_at AND now()<_b.ends_at AND _b.active AND _b.checked_in_at IS NOT NULL THEN (SELECT value FROM hotel_secrets WHERE key='wifi_password') END,
 'starts_at',_b.starts_at,'ends_at',_b.ends_at,'server_now',now(),'dinner_choice',_b.dinner_choice,'breakfast_choice',_b.breakfast_choice,'lunch_choice',_b.lunch_choice,'feedback_given',EXISTS(SELECT 1 FROM guest_feedback f WHERE f.booking_id=_b.id),
 'checked_in_at',_b.checked_in_at,'notice_kind',_b.notice_kind,'notice_at',_b.notice_at)
FROM rooms r WHERE r.number=_b.room_number $$;
REVOKE ALL ON FUNCTION public.guest_info(public.bookings,uuid) FROM PUBLIC,anon,authenticated;

-- Håndklædebytte: op til lige så mange håndklæder som der er personer på værelset pr. bytning.
CREATE OR REPLACE FUNCTION public.guest_order_towels(_token uuid,_device uuid,_qty integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; _id uuid;
BEGIN
  b:=require_guest(_token,_device);
  IF _qty IS NULL OR _qty<1 OR _qty>b.guests THEN RAISE EXCEPTION 'TOWEL_LIMIT'; END IF;
  INSERT INTO orders(room_number,booking_id,type,details,quantity) VALUES(b.room_number,b.id,'towels',_qty||' håndklæder til bytte',_qty) RETURNING id INTO _id;
  RETURN _id;
END $$;

-- Rengøring med antal håndklæder der skal byttes (0 = ingen).
CREATE OR REPLACE FUNCTION public.guest_request_cleaning_towels(_token uuid,_device uuid,_towel_count integer,_from timestamptz,_until timestamptz) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; _id uuid; _rep boolean;
BEGIN
  b:=require_guest(_token,_device);
  IF _towel_count IS NULL OR _towel_count<0 OR _towel_count>b.guests THEN RAISE EXCEPTION 'TOWEL_LIMIT'; END IF;
  IF (_from IS NULL) <> (_until IS NULL) OR (_from IS NOT NULL AND (_until<=_from OR _until<=now())) THEN RAISE EXCEPTION 'INVALID_WINDOW'; END IF;
  IF EXISTS(SELECT 1 FROM cleaning_requests WHERE booking_id=b.id AND status IN ('requested','in_progress')) THEN RAISE EXCEPTION 'CLEANING_ALREADY_REQUESTED'; END IF;
  _rep:=EXISTS(SELECT 1 FROM cleaning_requests WHERE booking_id=b.id AND status='not_reached');
  INSERT INTO cleaning_requests(booking_id,room_number,wants_towels,towel_count,away_from,away_until,is_repeat) VALUES(b.id,b.room_number,_towel_count>0,_towel_count,_from,_until,_rep) RETURNING id INTO _id;
  UPDATE rooms SET housekeeping_status='needs_cleaning',cleaning_booking_id=b.id,exchange_towels=_towel_count>0,updated_at=now() WHERE number=b.room_number;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.guest_extras(_token uuid,_device uuid) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings;
BEGIN
  b:=require_guest(_token,_device,false);
  RETURN json_build_object('cleaning',(SELECT row_to_json(q) FROM (SELECT id,status,wants_towels,towel_count,away_from,away_until,is_repeat,created_at FROM cleaning_requests WHERE booking_id=b.id ORDER BY created_at DESC LIMIT 1) q));
END $$;

-- Personale: rengøringskøen med antal håndklæder.
CREATE OR REPLACE FUNCTION public.staff_cleaning(_pin text) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN json_build_object('requests',(SELECT coalesce(json_agg(q),'[]'::json) FROM (
    SELECT c.id,c.room_number,b.guest_name,c.wants_towels,c.towel_count,c.away_from,c.away_until,c.status,c.is_repeat,c.created_at,c.updated_at
    FROM cleaning_requests c JOIN bookings b ON b.id=c.booking_id
    WHERE c.status IN ('requested','in_progress') OR c.updated_at>now()-interval '12 hours'
    ORDER BY c.created_at DESC LIMIT 100) q));
END $$;

-- Personale: bookinger med måltidsvalg (til "spiser på hotellet i dag").
CREATE OR REPLACE FUNCTION public.staff_pms(_pin text) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN json_build_object(
    'bookings',(SELECT coalesce(json_agg(q),'[]'::json) FROM (SELECT id,reference,room_number,guest_name,guest_email,guests,starts_at,ends_at,active,dinner_choice,breakfast_choice,lunch_choice FROM bookings ORDER BY starts_at DESC) q),
    'emails',(SELECT coalesce(json_agg(q),'[]'::json) FROM (SELECT e.id,e.recipient,e.subject,e.status,e.created_at,b.reference FROM invitation_emails e JOIN bookings b ON b.id=e.booking_id ORDER BY e.created_at DESC LIMIT 30) q),
    'feedback',(SELECT coalesce(json_agg(q),'[]'::json) FROM (SELECT id,room_number,rating,comment,created_at FROM guest_feedback ORDER BY created_at DESC LIMIT 30) q));
END $$;

-- Rating efter opholdet: virker først, når opholdet er slut, og også selvom sessionen er udløbet.
CREATE OR REPLACE FUNCTION public.guest_rating_state(_token uuid,_device uuid) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings;
BEGIN
  SELECT x.* INTO b FROM bookings x JOIN devices d ON d.booking_id=x.id WHERE x.access_token=_token AND d.id=_device;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_LOGIN'; END IF;
  RETURN json_build_object('guest_name',b.guest_name,'room_number',b.room_number,'ended',(now()>=b.ends_at OR NOT b.active),'rated',EXISTS(SELECT 1 FROM guest_feedback f WHERE f.booking_id=b.id));
END $$;

CREATE OR REPLACE FUNCTION public.guest_rate_stay(_token uuid,_device uuid,_rating integer,_comment text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings;
BEGIN
  SELECT x.* INTO b FROM bookings x JOIN devices d ON d.booking_id=x.id WHERE x.access_token=_token AND d.id=_device;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_LOGIN'; END IF;
  IF now()<b.ends_at AND b.active THEN RAISE EXCEPTION 'STAY_NOT_ENDED'; END IF;
  IF _rating IS NULL OR _rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'INVALID_RATING'; END IF;
  IF EXISTS(SELECT 1 FROM guest_feedback WHERE booking_id=b.id) THEN RAISE EXCEPTION 'ALREADY_RATED'; END IF;
  INSERT INTO guest_feedback(booking_id,room_number,rating,comment) VALUES(b.id,b.room_number,_rating,left(coalesce(_comment,''),1000));
END $$;

REVOKE ALL ON FUNCTION public.guest_meal(uuid,uuid,text,text),public.guest_request_cleaning_towels(uuid,uuid,integer,timestamptz,timestamptz),public.guest_rating_state(uuid,uuid),public.guest_rate_stay(uuid,uuid,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_meal(uuid,uuid,text,text),public.guest_request_cleaning_towels(uuid,uuid,integer,timestamptz,timestamptz),public.guest_rating_state(uuid,uuid),public.guest_rate_stay(uuid,uuid,integer,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guest_order_towels(uuid,uuid,integer),public.guest_extras(uuid,uuid),public.staff_cleaning(text),public.staff_pms(text) TO anon,authenticated;
