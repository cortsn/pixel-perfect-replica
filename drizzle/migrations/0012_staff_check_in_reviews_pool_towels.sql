-- Personalet kan tjekke gæster ind, alle anmeldelser kan ses, og håndklæde-bestillingen er nu "poolhåndklæder".

-- Personale: tjek en gæst ind. Er opholdet endnu ikke startet, startes det nu (gæsten får besked i appen).
CREATE OR REPLACE FUNCTION public.staff_check_in(_pin text,_booking uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO b FROM bookings WHERE id=_booking AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  IF b.checked_out_at IS NOT NULL OR b.ends_at<=now() THEN RAISE EXCEPTION 'STAY_ENDED'; END IF;
  IF b.checked_in_at IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_CHECKED_IN'; END IF;
  IF b.starts_at>now() THEN
    IF EXISTS(SELECT 1 FROM bookings o WHERE o.id<>b.id AND o.room_number=b.room_number AND o.active AND o.checked_out_at IS NULL AND o.starts_at<b.ends_at AND o.ends_at>now()) THEN RAISE EXCEPTION 'ROOM_BUSY'; END IF;
    UPDATE bookings SET starts_at=now(),checked_in_at=now(),notice_kind=CASE WHEN notice_kind IN ('end','both') THEN 'both' ELSE 'start' END,notice_at=now() WHERE id=b.id;
  ELSE
    UPDATE bookings SET checked_in_at=now() WHERE id=b.id;
  END IF;
END $$;

-- Regningen viser også gæstens e-mail (til gæstesiden i personalets system).
CREATE OR REPLACE FUNCTION public.internal_bill(_booking uuid) RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT json_build_object(
    'booking',(SELECT json_build_object('id',b.id,'reference',b.reference,'room_number',b.room_number,'guest_name',b.guest_name,'guest_email',b.guest_email,'guests',b.guests,'starts_at',b.starts_at,'ends_at',b.ends_at,'checked_in_at',b.checked_in_at,'checked_out_at',b.checked_out_at,'active',b.active,'rate_cents',r.rate_cents)
               FROM bookings b JOIN rooms r ON r.number=b.room_number WHERE b.id=_booking),
    'items',(SELECT coalesce(json_agg(q ORDER BY q.created_at,q.id),'[]'::json) FROM (SELECT id,category,description,quantity,unit_price_cents,source,order_id,paid,voided_at,void_reason,created_by,created_at FROM bill_items WHERE booking_id=_booking) q),
    'total_cents',coalesce((SELECT sum(quantity::bigint*unit_price_cents) FROM bill_items WHERE booking_id=_booking AND voided_at IS NULL),0),
    'paid_in_app_cents',coalesce((SELECT sum(quantity::bigint*unit_price_cents) FROM bill_items WHERE booking_id=_booking AND voided_at IS NULL AND paid),0),
    'due_cents',coalesce((SELECT sum(quantity::bigint*unit_price_cents) FROM bill_items WHERE booking_id=_booking AND voided_at IS NULL AND NOT paid),0))
$$;
REVOKE ALL ON FUNCTION public.internal_bill(uuid) FROM PUBLIC,anon,authenticated;

-- Personale: alle anmeldelser med gæst, valgfrit kun én vurdering, og søgning i navn, værelse og kommentar.
CREATE OR REPLACE FUNCTION public.staff_feedback(_pin text,_rating integer DEFAULT NULL,_q text DEFAULT '') RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE q text:='%'||lower(trim(coalesce(_q,'')))||'%';
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN json_build_object(
    'count',(SELECT count(*) FROM guest_feedback),
    'avg',(SELECT round(avg(rating)::numeric,1) FROM guest_feedback),
    'distribution',(SELECT coalesce(json_agg(d ORDER BY d.rating DESC),'[]'::json) FROM (SELECT g.rating,count(f.id)::integer AS n FROM generate_series(1,5) g(rating) LEFT JOIN guest_feedback f ON f.rating=g.rating GROUP BY g.rating) d),
    'items',(SELECT coalesce(json_agg(r ORDER BY r.created_at DESC),'[]'::json) FROM (
      SELECT f.id,f.room_number,f.rating,f.comment,f.created_at,b.guest_name,b.reference
      FROM guest_feedback f LEFT JOIN bookings b ON b.id=f.booking_id
      WHERE (_rating IS NULL OR f.rating=_rating) AND lower(coalesce(b.guest_name,'')||' '||f.room_number||' '||f.comment||' '||coalesce(b.reference,'')) LIKE q
      ORDER BY f.created_at DESC LIMIT 500) r));
END $$;

-- Gæst: bestil poolhåndklæder (højst antal personer og kun 1 gang hver 12. time). Almindelige værelseshåndklæder skiftes ved rengøring.
CREATE OR REPLACE FUNCTION public.guest_order_towels(_token uuid,_device uuid,_qty integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; _id uuid;
BEGIN
  b:=require_guest(_token,_device);
  IF _qty IS NULL OR _qty<1 OR _qty>b.guests THEN RAISE EXCEPTION 'TOWEL_LIMIT'; END IF;
  IF EXISTS(SELECT 1 FROM orders WHERE booking_id=b.id AND type='towels' AND status<>'cancelled' AND NOT coalesce(cancelled,false) AND created_at>now()-interval '12 hours') THEN RAISE EXCEPTION 'TOWEL_COOLDOWN'; END IF;
  INSERT INTO orders(room_number,booking_id,type,details,quantity) VALUES(b.room_number,b.id,'towels',_qty||' poolhåndklæder til bytte',_qty) RETURNING id INTO _id;
  RETURN _id;
END $$;

DO $$ DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND (p.proname LIKE 'staff\_%' OR p.proname='guest_order_towels')
  LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION '||f.sig||' FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION '||f.sig||' TO anon,authenticated';
  END LOOP;
END $$;
