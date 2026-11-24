-- Funktioner til/fra, beskeder til gæster og poolhåndklæder fra opgaveoversigten.

-- ============ Funktioner til/fra ============
-- Roomservice styres af roomservice_settings.enabled. Resten ligger i hotel_features (ingen klient-grants).
CREATE TABLE IF NOT EXISTS public.hotel_features(
  key text PRIMARY KEY CHECK (key IN ('towels','cleaning','meals','events','map')),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hotel_features ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.hotel_features TO service_role;

CREATE OR REPLACE FUNCTION public.internal_features() RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT json_build_object(
    'roomservice',coalesce((SELECT enabled FROM roomservice_settings WHERE id=1),true),
    'towels',coalesce((SELECT enabled FROM hotel_features WHERE key='towels'),true),
    'cleaning',coalesce((SELECT enabled FROM hotel_features WHERE key='cleaning'),true),
    'meals',coalesce((SELECT enabled FROM hotel_features WHERE key='meals'),true),
    'events',coalesce((SELECT enabled FROM hotel_features WHERE key='events'),true),
    'map',coalesce((SELECT enabled FROM hotel_features WHERE key='map'),true));
$$;
REVOKE ALL ON FUNCTION public.internal_features() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.internal_feature_on(_key text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce((internal_features()->>_key)::boolean,true);
$$;
REVOKE ALL ON FUNCTION public.internal_feature_on(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guest_features() RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT internal_features(); $$;

CREATE OR REPLACE FUNCTION public.staff_features(_pin text) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN internal_features();
END $$;

CREATE OR REPLACE FUNCTION public.staff_set_feature(_pin text,_key text,_enabled boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _enabled IS NULL THEN RAISE EXCEPTION 'INVALID_FEATURE'; END IF;
  IF _key='roomservice' THEN
    UPDATE roomservice_settings SET enabled=_enabled WHERE id=1;
  ELSIF _key IN ('towels','cleaning','meals','events','map') THEN
    INSERT INTO hotel_features(key,enabled) VALUES(_key,_enabled) ON CONFLICT(key) DO UPDATE SET enabled=excluded.enabled,updated_at=now();
  ELSE RAISE EXCEPTION 'INVALID_FEATURE'; END IF;
END $$;

-- Slåede funktioner kan heller ikke bestilles direkte mod databasen.
CREATE OR REPLACE FUNCTION public.guest_order_towels(_token uuid,_device uuid,_qty integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; _id uuid;
BEGIN
  b:=require_guest(_token,_device);
  IF NOT internal_feature_on('towels') THEN RAISE EXCEPTION 'FEATURE_OFF'; END IF;
  IF _qty IS NULL OR _qty<1 OR _qty>b.guests THEN RAISE EXCEPTION 'TOWEL_LIMIT'; END IF;
  IF EXISTS(SELECT 1 FROM orders WHERE booking_id=b.id AND type='towels' AND status<>'cancelled' AND NOT coalesce(cancelled,false) AND created_at>now()-interval '12 hours') THEN RAISE EXCEPTION 'TOWEL_COOLDOWN'; END IF;
  INSERT INTO orders(room_number,booking_id,type,details,quantity) VALUES(b.room_number,b.id,'towels',_qty||' poolhåndklæder til bytte',_qty) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.guest_request_cleaning_towels(_token uuid,_device uuid,_towel_count integer,_from timestamptz,_until timestamptz) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; _id uuid; _rep boolean;
BEGIN
  b:=require_guest(_token,_device);
  IF NOT internal_feature_on('cleaning') THEN RAISE EXCEPTION 'FEATURE_OFF'; END IF;
  IF _towel_count IS NULL OR _towel_count<0 OR _towel_count>b.guests THEN RAISE EXCEPTION 'TOWEL_LIMIT'; END IF;
  IF (_from IS NULL) <> (_until IS NULL) OR (_from IS NOT NULL AND (_until<=_from OR _until<=now())) THEN RAISE EXCEPTION 'INVALID_WINDOW'; END IF;
  IF EXISTS(SELECT 1 FROM cleaning_requests WHERE booking_id=b.id AND status IN ('requested','in_progress')) THEN RAISE EXCEPTION 'CLEANING_ALREADY_REQUESTED'; END IF;
  IF EXISTS(SELECT 1 FROM cleaning_requests WHERE booking_id=b.id AND kind='guest' AND status<>'not_reached' AND created_at>now()-interval '12 hours') THEN RAISE EXCEPTION 'CLEANING_COOLDOWN'; END IF;
  _rep:=EXISTS(SELECT 1 FROM cleaning_requests WHERE booking_id=b.id AND status='not_reached');
  INSERT INTO cleaning_requests(booking_id,room_number,wants_towels,towel_count,away_from,away_until,is_repeat) VALUES(b.id,b.room_number,_towel_count>0,_towel_count,_from,_until,_rep) RETURNING id INTO _id;
  UPDATE rooms SET housekeeping_status='needs_cleaning',cleaning_booking_id=b.id,exchange_towels=_towel_count>0,updated_at=now() WHERE number=b.room_number;
  RETURN _id;
END $$;

-- ============ Poolhåndklæder fra opgaveoversigten ============
-- Bytter personalet poolhåndklæder under rengøringen, lukkes gæstens åbne bestilling (ellers oprettes en leveret).
-- Det tæller som gæstens bestilling, så 12-timers reglen gælder fortsat.
CREATE OR REPLACE FUNCTION public.staff_pool_towels(_pin text,_room text,_qty integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; o uuid; q integer;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO b FROM bookings WHERE room_number=_room AND active AND checked_out_at IS NULL AND starts_at<=now() AND ends_at>now() ORDER BY starts_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_GUEST_IN_ROOM'; END IF;
  q:=coalesce(_qty,b.guests);
  IF q<1 OR q>b.guests THEN RAISE EXCEPTION 'TOWEL_LIMIT'; END IF;
  SELECT id INTO o FROM orders WHERE booking_id=b.id AND type='towels' AND NOT coalesce(cancelled,false) AND status IN ('pending','accepted','in_progress','ready') ORDER BY created_at LIMIT 1;
  IF o IS NOT NULL THEN
    UPDATE orders SET status='done',updated_at=now() WHERE id=o;
    RETURN o;
  END IF;
  INSERT INTO orders(room_number,booking_id,type,details,quantity,status) VALUES(b.room_number,b.id,'towels',q||' poolhåndklæder til bytte',q,'done') RETURNING id INTO o;
  RETURN o;
END $$;

-- ============ Beskeder til gæster ============
CREATE TABLE IF NOT EXISTS public.announcements(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL CHECK (length(trim(message)) BETWEEN 1 AND 500),
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.announcements TO service_role;

CREATE OR REPLACE FUNCTION public.staff_post_announcement(_pin text,_message text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF length(trim(coalesce(_message,'')))=0 OR length(_message)>500 THEN RAISE EXCEPTION 'INVALID_MESSAGE'; END IF;
  INSERT INTO announcements(message,created_by) VALUES(trim(_message),coalesce(internal_staff_who(_pin)->>'name','')) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.staff_announcements(_pin text) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN (SELECT coalesce(json_agg(x ORDER BY x.created_at DESC),'[]'::json) FROM (
    SELECT a.id,a.message,a.created_by,a.created_at,a.removed_at FROM announcements a ORDER BY a.created_at DESC LIMIT 30) x);
END $$;

CREATE OR REPLACE FUNCTION public.staff_remove_announcement(_pin text,_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE announcements SET removed_at=now() WHERE id=_id AND removed_at IS NULL;
END $$;

-- Gæsten ser beskeder fra de seneste 24 timer, men aldrig dem, der blev sendt før opholdet startede.
CREATE OR REPLACE FUNCTION public.guest_announcements(_token uuid,_device uuid) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings;
BEGIN
  b:=require_guest(_token,_device);
  RETURN (SELECT coalesce(json_agg(x ORDER BY x.created_at DESC),'[]'::json) FROM (
    SELECT a.id,a.message,a.created_at FROM announcements a
    WHERE a.removed_at IS NULL AND a.created_at>now()-interval '24 hours' AND a.created_at>=b.starts_at-interval '2 hours'
    ORDER BY a.created_at DESC LIMIT 5) x);
END $$;

DO $$ DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND (p.proname LIKE 'staff\_%' OR p.proname IN ('guest_features','guest_announcements','guest_order_towels','guest_request_cleaning_towels'))
  LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION '||f.sig||' FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION '||f.sig||' TO anon,authenticated';
  END LOOP;
END $$;
