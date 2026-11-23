-- Betaling af regninger uden checkout (med historik), gæsteinfo med aktivitet og billeder til menuvarer.

-- ============ Aktivitet i appen pr. enhed ============
ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_unlock_at timestamptz,
  ADD COLUMN IF NOT EXISTS unlock_count integer NOT NULL DEFAULT 0;

-- Sidst set opdateres højst 1 gang i minuttet pr. enhed (appen henter sessionen jævnligt).
CREATE OR REPLACE FUNCTION public.guest_session(_token uuid,_device uuid) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings;
BEGIN
  b:=require_guest(_token,_device,false);
  UPDATE devices SET last_seen_at=now() WHERE id=_device AND (last_seen_at IS NULL OR last_seen_at<now()-interval '1 minute');
  RETURN guest_info(b,_device);
END $$;

CREATE OR REPLACE FUNCTION public.guest_unlock(_token uuid,_device uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings;
BEGIN
  b:=require_guest(_token,_device);
  IF b.checked_in_at IS NULL THEN RAISE EXCEPTION 'NOT_CHECKED_IN'; END IF;
  UPDATE devices SET last_unlock_at=now(),unlock_count=unlock_count+1,last_seen_at=now() WHERE id=_device;
  RETURN 'Oplåsning simuleret · Værelse '||b.room_number;
END $$;

-- ============ Betalinger ============
CREATE TABLE public.bill_payments(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  room_number text NOT NULL,
  amount_cents integer NOT NULL,
  method text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  paid_by text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'bill' CHECK (kind IN ('bill','checkout')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bill_payments_created_idx ON public.bill_payments(created_at);
CREATE INDEX bill_payments_booking_idx ON public.bill_payments(booking_id);
GRANT ALL ON public.bill_payments TO service_role;
ALTER TABLE public.bill_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.bill_payments(id) ON DELETE SET NULL;

-- Tidligere checkouts får en betaling, så de også står i regningshistorikken.
WITH ins AS (
  INSERT INTO public.bill_payments(booking_id,room_number,amount_cents,method,note,paid_by,kind,created_at)
  SELECT c.booking_id,c.room_number,c.due_cents,c.payment_method,c.note,c.checked_out_by,'checkout',c.created_at FROM public.checkouts c
  WHERE c.due_cents>0 AND NOT EXISTS(SELECT 1 FROM public.bill_payments p WHERE p.booking_id=c.booking_id)
  RETURNING id,booking_id)
UPDATE public.bill_items i SET paid=true,payment_id=ins.id FROM ins WHERE i.booking_id=ins.booking_id AND i.voided_at IS NULL AND NOT i.paid;

-- Personale: gæsten betaler regningen (uden at tjekke ud). Alle ubetalte poster markeres som betalt.
CREATE OR REPLACE FUNCTION public.staff_bill_pay(_pin text,_booking uuid,_method text,_note text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; due bigint; _id uuid;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO b FROM bookings WHERE id=_booking FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  IF b.checked_out_at IS NOT NULL THEN RAISE EXCEPTION 'BILL_CLOSED'; END IF;
  SELECT coalesce(sum(quantity::bigint*unit_price_cents),0) INTO due FROM bill_items WHERE booking_id=_booking AND voided_at IS NULL AND NOT paid;
  IF due<=0 THEN RAISE EXCEPTION 'NOTHING_DUE'; END IF;
  IF length(trim(coalesce(_method,'')))=0 THEN RAISE EXCEPTION 'PAYMENT_REQUIRED'; END IF;
  INSERT INTO bill_payments(booking_id,room_number,amount_cents,method,note,paid_by,kind)
  VALUES(b.id,b.room_number,due,left(trim(_method),80),left(coalesce(_note,''),500),coalesce(internal_staff_who(_pin)->>'name',''),'bill') RETURNING id INTO _id;
  UPDATE bill_items SET paid=true,payment_id=_id,updated_at=now() WHERE booking_id=_booking AND voided_at IS NULL AND NOT paid;
  RETURN _id;
END $$;

-- Betalte regninger (historik): søg i gæst, værelse og bookingnummer, og begræns på dato.
CREATE OR REPLACE FUNCTION public.staff_payments(_pin text,_q text,_from date,_to date) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE q text:='%'||lower(trim(coalesce(_q,'')))||'%';
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN (SELECT coalesce(json_agg(r ORDER BY r.created_at DESC),'[]'::json) FROM (
    SELECT p.id,p.booking_id,p.room_number,p.amount_cents,p.method,p.note,p.paid_by,p.kind,p.created_at,b.guest_name,b.reference,
      (SELECT coalesce(json_agg(json_build_object('description',i.description,'quantity',i.quantity,'unit_price_cents',i.unit_price_cents,'category',i.category) ORDER BY i.created_at),'[]'::json) FROM bill_items i WHERE i.payment_id=p.id) AS items
    FROM bill_payments p JOIN bookings b ON b.id=p.booking_id
    WHERE lower(b.guest_name||' '||p.room_number||' '||b.reference) LIKE q
      AND (p.created_at AT TIME ZONE 'Europe/Copenhagen')::date BETWEEN coalesce(_from,'0001-01-01'::date) AND coalesce(_to,'9999-12-31'::date)
    ORDER BY p.created_at DESC LIMIT 300) r);
END $$;

-- Regningen viser også betalingerne.
CREATE OR REPLACE FUNCTION public.internal_bill(_booking uuid) RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT json_build_object(
    'booking',(SELECT json_build_object('id',b.id,'reference',b.reference,'room_number',b.room_number,'guest_name',b.guest_name,'guest_email',b.guest_email,'guests',b.guests,'starts_at',b.starts_at,'ends_at',b.ends_at,'checked_in_at',b.checked_in_at,'checked_out_at',b.checked_out_at,'active',b.active,'rate_cents',r.rate_cents)
               FROM bookings b JOIN rooms r ON r.number=b.room_number WHERE b.id=_booking),
    'items',(SELECT coalesce(json_agg(q ORDER BY q.created_at,q.id),'[]'::json) FROM (SELECT id,category,description,quantity,unit_price_cents,source,order_id,paid,payment_id,voided_at,void_reason,created_by,created_at FROM bill_items WHERE booking_id=_booking) q),
    'payments',(SELECT coalesce(json_agg(p ORDER BY p.created_at),'[]'::json) FROM (SELECT id,amount_cents,method,note,paid_by,kind,created_at FROM bill_payments WHERE booking_id=_booking) p),
    'total_cents',coalesce((SELECT sum(quantity::bigint*unit_price_cents) FROM bill_items WHERE booking_id=_booking AND voided_at IS NULL),0),
    'paid_in_app_cents',coalesce((SELECT sum(quantity::bigint*unit_price_cents) FROM bill_items WHERE booking_id=_booking AND voided_at IS NULL AND paid),0),
    'due_cents',coalesce((SELECT sum(quantity::bigint*unit_price_cents) FROM bill_items WHERE booking_id=_booking AND voided_at IS NULL AND NOT paid),0))
$$;
REVOKE ALL ON FUNCTION public.internal_bill(uuid) FROM PUBLIC,anon,authenticated;

-- Gæsteliste: saldo er det, der mangler at blive betalt; med samlet beløb og åbne roomserviceordrer (vigtigt ved tjek ud).
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
      (b.starts_at<=now() AND b.ends_at<=now()) AS overdue
    FROM bookings b WHERE b.active AND b.checked_out_at IS NULL AND b.ends_at>now()-interval '7 days') q);
END $$;

-- ============ Gæsteinfo ============
CREATE OR REPLACE FUNCTION public.staff_guest_info(_pin text,_booking uuid) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; r rooms;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO b FROM bookings WHERE id=_booking;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  SELECT * INTO r FROM rooms WHERE number=b.room_number;
  RETURN json_build_object(
    'booking',json_build_object('id',b.id,'reference',b.reference,'guest_name',b.guest_name,'guest_email',b.guest_email,'guests',b.guests,'room_number',b.room_number,'starts_at',b.starts_at,'ends_at',b.ends_at,'checked_in_at',b.checked_in_at,'checked_out_at',b.checked_out_at,
      'breakfast_choice',b.breakfast_choice,'lunch_choice',b.lunch_choice,'dinner_choice',b.dinner_choice),
    'room',json_build_object('number',r.number,'floor',r.floor,'capacity',r.capacity,'housekeeping_status',r.housekeeping_status),
    'devices',json_build_object('count',(SELECT count(*) FROM devices d WHERE d.booking_id=b.id),'max',b.guests+2,
      'items',(SELECT coalesce(json_agg(x ORDER BY x.created_at),'[]'::json) FROM (SELECT d.id,d.created_at,d.last_seen_at,d.last_unlock_at,d.unlock_count FROM devices d WHERE d.booking_id=b.id) x)),
    'activity',json_build_object(
      'orders_total',(SELECT count(*) FROM orders o WHERE o.booking_id=b.id AND NOT o.cancelled),
      'orders_open',(SELECT count(*) FROM orders o WHERE o.booking_id=b.id AND NOT o.cancelled AND o.status IN ('pending','accepted','in_progress','ready')),
      'cleaning_requests',(SELECT count(*) FROM cleaning_requests c WHERE c.booking_id=b.id AND c.kind='guest'),
      'unlocks',(SELECT coalesce(sum(d.unlock_count),0) FROM devices d WHERE d.booking_id=b.id),
      'last_seen_at',(SELECT max(d.last_seen_at) FROM devices d WHERE d.booking_id=b.id),
      'review',(SELECT json_build_object('rating',f.rating,'comment',f.comment,'created_at',f.created_at) FROM guest_feedback f WHERE f.booking_id=b.id ORDER BY f.created_at DESC LIMIT 1),
      'timeline',(SELECT coalesce(json_agg(t ORDER BY t.at DESC),'[]'::json) FROM (
        SELECT d.created_at AS at,'device'::text AS kind,'Ny enhed tilknyttet rummet'::text AS text FROM devices d WHERE d.booking_id=b.id
        UNION ALL SELECT b.checked_in_at,'checkin','Tjekket ind' WHERE b.checked_in_at IS NOT NULL
        UNION ALL SELECT d.last_unlock_at,'unlock','Låste døren op (i alt '||d.unlock_count||' gange)' FROM devices d WHERE d.booking_id=b.id AND d.last_unlock_at IS NOT NULL
        UNION ALL SELECT o.created_at,'order',CASE WHEN o.type='towels' THEN 'Bestilte '||o.quantity||' håndklæder' ELSE 'Bestilte roomservice: '||left(o.details,90) END FROM orders o WHERE o.booking_id=b.id AND NOT o.cancelled
        UNION ALL SELECT c.created_at,'cleaning','Bestilte rengøring' FROM cleaning_requests c WHERE c.booking_id=b.id AND c.kind='guest'
        UNION ALL SELECT f.created_at,'review','Skrev en anmeldelse ('||f.rating||' af 5)' FROM guest_feedback f WHERE f.booking_id=b.id
        ORDER BY at DESC LIMIT 40) t)));
END $$;

-- ============ Billeder til menuvarer (uploadet fra computeren) ============
-- Billedet gemmes som data-URL i sin egen tabel, så menuen ikke bliver tung. Gæsteappen henter billedet først, når det skal vises.
CREATE TABLE public.menu_item_images(
  item_id uuid PRIMARY KEY REFERENCES public.menu_items(id) ON DELETE CASCADE,
  data text NOT NULL CHECK (data LIKE 'data:image/%' AND length(data)<=450000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.menu_item_images TO service_role;
ALTER TABLE public.menu_item_images ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.menu_item_image(_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT data FROM menu_item_images WHERE item_id=_id $$;

CREATE OR REPLACE FUNCTION public.staff_menu_item_image_set(_pin text,_item uuid,_data text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF NOT EXISTS(SELECT 1 FROM menu_items WHERE id=_item) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF _data IS NULL OR _data NOT LIKE 'data:image/%' OR length(_data)>450000 THEN RAISE EXCEPTION 'INVALID_IMAGE'; END IF;
  INSERT INTO menu_item_images(item_id,data,updated_at) VALUES(_item,_data,now()) ON CONFLICT(item_id) DO UPDATE SET data=excluded.data,updated_at=now();
  UPDATE menu_items SET updated_at=now() WHERE id=_item;
END $$;

CREATE OR REPLACE FUNCTION public.staff_menu_item_image_remove(_pin text,_item uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  DELETE FROM menu_item_images WHERE item_id=_item;
  UPDATE menu_items SET updated_at=now() WHERE id=_item;
END $$;

CREATE OR REPLACE FUNCTION public.staff_checkout(_pin text,_booking uuid,_method text,_note text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; bill json; _total bigint; _paid bigint; _due bigint; _id uuid; _who text; _pid uuid;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO b FROM bookings WHERE id=_booking AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  IF b.checked_out_at IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_CHECKED_OUT'; END IF;
  IF now()<=b.starts_at THEN RAISE EXCEPTION 'STAY_NOT_STARTED'; END IF;
  IF EXISTS(SELECT 1 FROM orders WHERE booking_id=b.id AND type='room_service' AND NOT cancelled AND status IN ('pending','accepted','in_progress','ready')) THEN RAISE EXCEPTION 'OPEN_ORDERS'; END IF;
  bill:=internal_bill(b.id);
  _total:=(bill->>'total_cents')::bigint; _paid:=(bill->>'paid_in_app_cents')::bigint; _due:=(bill->>'due_cents')::bigint;
  IF _due>0 AND length(trim(coalesce(_method,'')))=0 THEN RAISE EXCEPTION 'PAYMENT_REQUIRED'; END IF;
  _who:=coalesce(internal_staff_who(_pin)->>'name','');
  INSERT INTO checkouts(booking_id,reference,room_number,guest_name,guests,starts_at,ends_at,total_cents,paid_in_app_cents,due_cents,payment_method,note,items,checked_out_by)
  VALUES(b.id,b.reference,b.room_number,b.guest_name,b.guests,b.starts_at,least(b.ends_at,now()),_total,_paid,_due,left(trim(coalesce(_method,'')),80),left(coalesce(_note,''),500),(bill->'items')::jsonb,_who) RETURNING id INTO _id;
  IF _due>0 THEN
    INSERT INTO bill_payments(booking_id,room_number,amount_cents,method,note,paid_by,kind) VALUES(b.id,b.room_number,_due,left(trim(coalesce(_method,'')),80),left(coalesce(_note,''),500),_who,'checkout') RETURNING id INTO _pid;
    UPDATE bill_items SET paid=true,payment_id=_pid,updated_at=now() WHERE booking_id=b.id AND voided_at IS NULL AND NOT paid;
  END IF;
  UPDATE bookings SET checked_out_at=now(),ends_at=least(ends_at,now()) WHERE id=b.id;
  UPDATE rooms SET housekeeping_status='needs_cleaning',cleaning_booking_id=b.id,exchange_towels=true,updated_at=now() WHERE number=b.room_number;
  IF EXISTS(SELECT 1 FROM cleaning_requests WHERE booking_id=b.id AND status IN ('requested','in_progress')) THEN
    UPDATE cleaning_requests SET kind='checkout',wants_towels=true,towel_count=b.guests,updated_at=now() WHERE booking_id=b.id AND status IN ('requested','in_progress');
  ELSE
    INSERT INTO cleaning_requests(booking_id,room_number,wants_towels,towel_count,status,kind) VALUES(b.id,b.room_number,true,b.guests,'requested','checkout');
  END IF;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.staff_bill_edit(_pin text,_item uuid,_category text,_description text,_qty integer,_unit_cents integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE it bill_items;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO it FROM bill_items WHERE id=_item FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF EXISTS(SELECT 1 FROM bookings WHERE id=it.booking_id AND checked_out_at IS NOT NULL) THEN RAISE EXCEPTION 'BILL_CLOSED'; END IF;
  IF it.voided_at IS NOT NULL THEN RAISE EXCEPTION 'ITEM_VOIDED'; END IF;
  IF it.paid THEN RAISE EXCEPTION 'ITEM_PAID'; END IF;
  IF _category NOT IN ('room_service','restaurant_bar','minibar','service','accommodation','other') THEN RAISE EXCEPTION 'INVALID_CATEGORY'; END IF;
  IF _description IS NULL OR length(trim(_description))=0 THEN RAISE EXCEPTION 'INVALID_NAME'; END IF;
  IF _qty IS NULL OR _qty<1 OR _qty>999 THEN RAISE EXCEPTION 'INVALID_QTY'; END IF;
  IF _unit_cents IS NULL OR _unit_cents<-10000000 OR _unit_cents>10000000 THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;
  UPDATE bill_items SET category=_category,description=left(trim(_description),200),quantity=_qty,unit_price_cents=_unit_cents,updated_at=now() WHERE id=_item;
END $$;

CREATE OR REPLACE FUNCTION public.staff_bill_void(_pin text,_item uuid,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE it bill_items;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO it FROM bill_items WHERE id=_item FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF EXISTS(SELECT 1 FROM bookings WHERE id=it.booking_id AND checked_out_at IS NOT NULL) THEN RAISE EXCEPTION 'BILL_CLOSED'; END IF;
  IF it.voided_at IS NOT NULL THEN RETURN; END IF;
  IF it.paid THEN RAISE EXCEPTION 'ITEM_PAID'; END IF;
  UPDATE bill_items SET voided_at=now(),void_reason=left(coalesce(_reason,''),200),updated_at=now() WHERE id=_item;
END $$;

CREATE OR REPLACE FUNCTION public.guest_menu() RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT json_build_object(
    'settings',(SELECT json_build_object('enabled',s.enabled,'opens_at',to_char(s.opens_at,'HH24:MI'),'closes_at',to_char(s.closes_at,'HH24:MI'),'open_now',s.enabled AND public.in_hours(s.opens_at,s.closes_at)) FROM roomservice_settings s WHERE s.id=1),
    'categories',(SELECT coalesce(json_agg(json_build_object('id',c.id,'name',c.name,'items',
        (SELECT coalesce(json_agg(json_build_object('id',i.id,'name',i.name,'description',i.description,'price_cents',i.price_cents,'image_url',i.image_url,'image_ver',(SELECT floor(extract(epoch FROM m.updated_at))::bigint FROM menu_item_images m WHERE m.item_id=i.id),'variants',i.variants,'addons',i.addons,
            'available_now',public.in_hours(i.available_from,i.available_to),
            'available_from',to_char(i.available_from,'HH24:MI'),'available_to',to_char(i.available_to,'HH24:MI')) ORDER BY i.sort,i.name),'[]'::json)
         FROM menu_items i WHERE i.category_id=c.id AND i.active)) ORDER BY c.sort,c.name),'[]'::json)
      FROM menu_categories c WHERE c.active))
$$;

CREATE OR REPLACE FUNCTION public.staff_menu(_pin text) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN json_build_object(
    'settings',(SELECT row_to_json(s) FROM roomservice_settings s WHERE id=1),
    'categories',(SELECT coalesce(json_agg(q ORDER BY q.sort,q.name),'[]'::json) FROM (SELECT id,name,sort,active FROM menu_categories) q),
    'items',(SELECT coalesce(json_agg(q ORDER BY q.sort,q.name),'[]'::json) FROM (SELECT id,category_id,name,description,price_cents,image_url,(SELECT floor(extract(epoch FROM m.updated_at))::bigint FROM menu_item_images m WHERE m.item_id=menu_items.id) AS image_ver,active,sort,to_char(available_from,'HH24:MI') AS available_from,to_char(available_to,'HH24:MI') AS available_to,variants,addons FROM menu_items) q));
END $$;

DO $$ DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND (p.proname LIKE 'staff\_%' OR p.proname IN ('guest_menu','menu_item_image','guest_session','guest_unlock'))
  LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION '||f.sig||' FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION '||f.sig||' TO anon,authenticated';
  END LOOP;
END $$;
