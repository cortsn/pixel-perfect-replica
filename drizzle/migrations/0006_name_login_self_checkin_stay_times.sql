-- Login med bookingnummer + navn, selv check-in fra telefonen og ændring af start-/sluttid for personalet.
-- Early check-in-funktionerne fra 0005 bliver liggende i databasen, men bruges ikke længere af appen.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS notice_kind text CHECK (notice_kind IN ('start','end','both')),
  ADD COLUMN IF NOT EXISTS notice_at timestamptz;

-- Login: bookingnummer + gæstens navn (store/små bogstaver og ekstra mellemrum er ligegyldige). Værelsesnummer bruges ikke længere.
DROP FUNCTION IF EXISTS public.guest_login(text,text);
CREATE FUNCTION public.guest_login(_reference text,_name text) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings;
BEGIN
  SELECT * INTO b FROM bookings
  WHERE upper(trim(reference))=upper(trim(_reference))
    AND lower(regexp_replace(trim(guest_name),'\s+',' ','g'))=lower(regexp_replace(trim(_name),'\s+',' ','g'))
  ORDER BY starts_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_LOGIN'; END IF;
  IF NOT b.active OR now()>=b.ends_at THEN RAISE EXCEPTION 'STAY_EXPIRED'; END IF;
  RETURN guest_info(b,register_device(b));
END $$;
REVOKE ALL ON FUNCTION public.guest_login(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_login(text,text) TO anon,authenticated;

-- Gæste-sessionen får check-in-tidspunkt og besked om ændret tid. Wi-Fi vises først efter check-in.
CREATE OR REPLACE FUNCTION public.guest_info(_b public.bookings,_device uuid) RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT json_build_object('access_token',_b.access_token,'device_id',_device,'guest_name',_b.guest_name,'room_number',_b.room_number,'reference',_b.reference,'capacity',r.capacity,'guests',_b.guests,'towel_limit',_b.guests,'towels_used',public.towels_used(_b.id),'max_devices',_b.guests+2,'devices',(SELECT count(*) FROM public.devices d WHERE d.booking_id=_b.id),'housekeeping_status',CASE WHEN r.cleaning_booking_id=_b.id THEN r.housekeeping_status ELSE 'occupied' END,
 'wifi_ssid',CASE WHEN now()>=_b.starts_at AND now()<_b.ends_at AND _b.active AND _b.checked_in_at IS NOT NULL THEN (SELECT value FROM public.hotel_secrets WHERE key='wifi_ssid') END,
 'wifi_password',CASE WHEN now()>=_b.starts_at AND now()<_b.ends_at AND _b.active AND _b.checked_in_at IS NOT NULL THEN (SELECT value FROM public.hotel_secrets WHERE key='wifi_password') END,
 'starts_at',_b.starts_at,'ends_at',_b.ends_at,'server_now',now(),'dinner_choice',_b.dinner_choice,'feedback_given',EXISTS(SELECT 1 FROM public.guest_feedback f WHERE f.booking_id=_b.id),
 'checked_in_at',_b.checked_in_at,'notice_kind',_b.notice_kind,'notice_at',_b.notice_at)
FROM public.rooms r WHERE r.number=_b.room_number $$;
REVOKE ALL ON FUNCTION public.guest_info(public.bookings,uuid) FROM PUBLIC,anon,authenticated;

-- Gæst: tjek selv ind fra telefonen, når opholdet er startet.
CREATE OR REPLACE FUNCTION public.guest_check_in(_token uuid,_device uuid) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings;
BEGIN
  b:=require_guest(_token,_device);
  UPDATE bookings SET checked_in_at=coalesce(checked_in_at,now()) WHERE id=b.id;
  SELECT * INTO b FROM bookings WHERE id=b.id;
  RETURN guest_info(b,_device);
END $$;

-- Den digitale nøgle virker først efter check-in.
CREATE OR REPLACE FUNCTION public.guest_unlock(_token uuid,_device uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings;
BEGIN
  b:=require_guest(_token,_device);
  IF b.checked_in_at IS NULL THEN RAISE EXCEPTION 'NOT_CHECKED_IN'; END IF;
  RETURN 'Oplåsning simuleret · Værelse '||b.room_number;
END $$;

-- Personale: ændr start- og/eller sluttid. Gæsten får en besked næste gang appen opdaterer.
CREATE OR REPLACE FUNCTION public.staff_set_stay(_pin text,_booking uuid,_starts timestamptz,_ends timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; s boolean; e boolean;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO b FROM bookings WHERE id=_booking AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  IF _ends<=_starts THEN RAISE EXCEPTION 'INVALID_STAY'; END IF;
  IF EXISTS(SELECT 1 FROM bookings o WHERE o.id<>b.id AND o.room_number=b.room_number AND o.active AND o.starts_at<_ends AND o.ends_at>_starts) THEN RAISE EXCEPTION 'ROOM_BUSY'; END IF;
  s:=_starts IS DISTINCT FROM b.starts_at; e:=_ends IS DISTINCT FROM b.ends_at;
  IF NOT s AND NOT e THEN RETURN; END IF;
  UPDATE bookings SET starts_at=_starts,ends_at=_ends,notice_kind=CASE WHEN s AND e THEN 'both' WHEN s THEN 'start' ELSE 'end' END,notice_at=now() WHERE id=b.id;
END $$;

-- Personale: ophold der ikke er slut, med check-in-status.
CREATE OR REPLACE FUNCTION public.staff_stays(_pin text) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN (SELECT coalesce(json_agg(q),'[]'::json) FROM (
    SELECT id,reference,room_number,guest_name,guests,starts_at,ends_at,checked_in_at,notice_at
    FROM bookings WHERE active AND ends_at>now() ORDER BY starts_at LIMIT 100) q);
END $$;

REVOKE ALL ON FUNCTION public.guest_check_in(uuid,uuid),public.staff_set_stay(text,uuid,timestamptz,timestamptz),public.staff_stays(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_check_in(uuid,uuid),public.staff_set_stay(text,uuid,timestamptz,timestamptz),public.staff_stays(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guest_unlock(uuid,uuid) TO anon,authenticated;
