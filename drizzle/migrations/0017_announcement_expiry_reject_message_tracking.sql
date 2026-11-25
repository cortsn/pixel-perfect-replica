-- Beskeder med udløb, standardbesked ved afvisning og ordresporing for gæsten.

-- ============ Standardbesked ved afvisning ============
ALTER TABLE public.roomservice_settings ADD COLUMN IF NOT EXISTS reject_message text NOT NULL DEFAULT 'Vi kan desværre ikke levere din bestilling lige nu.';

CREATE OR REPLACE FUNCTION public.staff_set_reject_message(_pin text,_message text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF length(trim(coalesce(_message,'')))=0 OR length(_message)>200 THEN RAISE EXCEPTION 'INVALID_MESSAGE'; END IF;
  UPDATE roomservice_settings SET reject_message=trim(_message) WHERE id=1;
END $$;

-- Afvis/ordrestatus: en afvisning uden årsag får standardbeskeden. Alle åbne ordrer kan afvises (også fra tjek ud).
CREATE OR REPLACE FUNCTION public.staff_set_order_status(_pin text,_order uuid,_status text,_reason text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o orders;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _status NOT IN ('pending','accepted','in_progress','ready','done','rejected') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  SELECT * INTO o FROM orders WHERE id=_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF o.cancelled OR o.status IN ('cancelled','done','rejected') THEN RAISE EXCEPTION 'ORDER_CLOSED'; END IF;
  UPDATE orders SET status=_status,updated_at=now(),
    reject_reason=CASE WHEN _status='rejected' THEN left(coalesce(nullif(trim(coalesce(_reason,'')),''),(SELECT reject_message FROM roomservice_settings WHERE id=1),''),200) ELSE reject_reason END
  WHERE id=_order;
  IF _status='done' AND o.type='room_service' AND o.booking_id IS NOT NULL AND NOT o.paid THEN
    INSERT INTO bill_items(booking_id,room_number,category,description,quantity,unit_price_cents,source,order_id,order_line,created_by)
    SELECT o.booking_id,o.room_number,'room_service',left(l->>'name',200),(l->>'qty')::integer,(l->>'unit_cents')::integer,'order',o.id,(idx)::integer,coalesce(internal_staff_who(_pin)->>'name','')
    FROM jsonb_array_elements(o.items) WITH ORDINALITY AS t(l,idx)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Gæstens ordrer med opdateringstidspunkt, så appen kan følge ordren og give besked ved hver ændring.
CREATE OR REPLACE FUNCTION public.guest_orders(_token uuid,_device uuid) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; result json;
BEGIN
  b:=require_guest(_token,_device);
  SELECT coalesce(json_agg(q),'[]'::json) INTO result FROM (
    SELECT id,type,details,CASE WHEN cancelled THEN 'cancelled' ELSE status END AS status,created_at,updated_at,total_cents,reject_reason
    FROM orders WHERE booking_id=b.id ORDER BY created_at DESC LIMIT 20) q;
  RETURN result;
END $$;

-- ============ Beskeder: udløb valgt af hotellet ============
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS expires_at timestamptz;

DROP FUNCTION IF EXISTS public.staff_post_announcement(text,text);
-- _expires_at: hvornår beskeden fjernes fra gæsternes app. NULL = den bliver, mens opholdet varer.
CREATE OR REPLACE FUNCTION public.staff_post_announcement(_pin text,_message text,_expires_at timestamptz DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF length(trim(coalesce(_message,'')))=0 OR length(_message)>500 THEN RAISE EXCEPTION 'INVALID_MESSAGE'; END IF;
  IF _expires_at IS NOT NULL AND _expires_at<=now() THEN RAISE EXCEPTION 'INVALID_EXPIRY'; END IF;
  INSERT INTO announcements(message,created_by,expires_at) VALUES(trim(_message),coalesce(internal_staff_who(_pin)->>'name',''),_expires_at) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.staff_announcements(_pin text) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN (SELECT coalesce(json_agg(x ORDER BY x.created_at DESC),'[]'::json) FROM (
    SELECT a.id,a.message,a.created_by,a.created_at,a.removed_at,a.expires_at FROM announcements a ORDER BY a.created_at DESC LIMIT 30) x);
END $$;

-- Gæsten ser alle beskeder fra opholdet, der ikke er fjernet eller udløbet (nyeste først).
CREATE OR REPLACE FUNCTION public.guest_announcements(_token uuid,_device uuid) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings;
BEGIN
  b:=require_guest(_token,_device);
  RETURN (SELECT coalesce(json_agg(x ORDER BY x.created_at DESC),'[]'::json) FROM (
    SELECT a.id,a.message,a.created_at FROM announcements a
    WHERE a.removed_at IS NULL AND (a.expires_at IS NULL OR a.expires_at>now()) AND a.created_at>=b.starts_at-interval '2 hours'
    ORDER BY a.created_at DESC LIMIT 30) x);
END $$;

DO $$ DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND (p.proname LIKE 'staff\_%' OR p.proname IN ('guest_orders','guest_announcements'))
  LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION '||f.sig||' FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION '||f.sig||' TO anon,authenticated';
  END LOOP;
END $$;
