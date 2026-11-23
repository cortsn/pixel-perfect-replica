-- Roomservice-menu styret af hotellet, gæsteregning, salg, checkout, historik, dashboard og medarbejdere.
-- HotelPilot håndterer IKKE betaling: roomservice lægges på regningen, og personalet registrerer, at regningen er betalt
-- via hotellets eget betalingssystem, før checkout afsluttes.

-- ============ Hjælpefunktioner ============
-- Er klokken nu (dansk tid) inden for et åbningstidsrum? Understøtter åbningstid hen over midnat. Ens tider = døgnet rundt.
CREATE OR REPLACE FUNCTION public.in_hours(_from time,_to time) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE t time:=(now() AT TIME ZONE 'Europe/Copenhagen')::time;
BEGIN
  IF _from IS NULL OR _to IS NULL OR _from=_to THEN RETURN true; END IF;
  IF _from<_to THEN RETURN t>=_from AND t<_to; END IF;
  RETURN t>=_from OR t<_to;
END $$;
REVOKE ALL ON FUNCTION public.in_hours(time,time) FROM PUBLIC;

-- ============ Medarbejdere ============
CREATE TABLE public.staff_members(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  role text NOT NULL DEFAULT 'reception' CHECK (role IN ('manager','reception','kitchen','housekeeping')),
  pin_salt text NOT NULL,
  pin_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.staff_members TO service_role;
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.pin_hash(_salt text,_pin text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT encode(sha256(convert_to(_salt||':'||_pin,'UTF8')),'hex') $$;
REVOKE ALL ON FUNCTION public.pin_hash(text,text) FROM PUBLIC;

-- Hovedkoden (hotel_secrets) og aktive medarbejderes koder giver adgang.
CREATE OR REPLACE FUNCTION public.staff_check(_pin text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT _pin IS NOT NULL AND (
    EXISTS(SELECT 1 FROM hotel_secrets WHERE key='staff_pin' AND value=_pin)
    OR EXISTS(SELECT 1 FROM staff_members m WHERE m.active AND m.pin_hash=public.pin_hash(m.pin_salt,_pin)))
$$;

-- Intern: hvem er det, og hvilken rolle har vedkommende? Hovedkoden er "Leder".
CREATE OR REPLACE FUNCTION public.internal_staff_who(_pin text) RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(
    (SELECT json_build_object('name',m.name,'role',m.role) FROM staff_members m WHERE m.active AND m.pin_hash=public.pin_hash(m.pin_salt,_pin) LIMIT 1),
    (SELECT json_build_object('name','Hovedkode','role','manager') FROM hotel_secrets WHERE key='staff_pin' AND value=_pin))
$$;
REVOKE ALL ON FUNCTION public.internal_staff_who(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.staff_who(_pin text) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN internal_staff_who(_pin);
END $$;

CREATE OR REPLACE FUNCTION public.internal_require_manager(_pin text) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF internal_staff_who(_pin)->>'role'<>'manager' THEN RAISE EXCEPTION 'MANAGER_ONLY'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.internal_require_manager(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.staff_members_list(_pin text) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN (SELECT coalesce(json_agg(q ORDER BY q.name),'[]'::json) FROM (SELECT id,name,role,active,created_at FROM staff_members) q);
END $$;

-- Opret (id = NULL) eller ret en medarbejder. Kun ledere. _new_pin er påkrævet ved oprettelse og valgfri ved ændring.
CREATE OR REPLACE FUNCTION public.staff_member_save(_pin text,_id uuid,_name text,_role text,_new_pin text,_active boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _salt text; _out uuid;
BEGIN
  PERFORM internal_require_manager(_pin);
  IF _role NOT IN ('manager','reception','kitchen','housekeeping') THEN RAISE EXCEPTION 'INVALID_ROLE'; END IF;
  IF _name IS NULL OR length(trim(_name))=0 THEN RAISE EXCEPTION 'INVALID_NAME'; END IF;
  IF _new_pin IS NOT NULL AND _new_pin<>'' THEN
    IF _new_pin !~ '^[0-9]{4,8}$' THEN RAISE EXCEPTION 'INVALID_PIN'; END IF;
    IF staff_check(_new_pin) AND NOT EXISTS(SELECT 1 FROM staff_members m WHERE m.id=_id AND m.pin_hash=public.pin_hash(m.pin_salt,_new_pin)) THEN RAISE EXCEPTION 'PIN_TAKEN'; END IF;
  END IF;
  IF _id IS NULL THEN
    IF _new_pin IS NULL OR _new_pin='' THEN RAISE EXCEPTION 'INVALID_PIN'; END IF;
    _salt:=gen_random_uuid()::text;
    INSERT INTO staff_members(name,role,pin_salt,pin_hash,active) VALUES(left(trim(_name),80),_role,_salt,public.pin_hash(_salt,_new_pin),coalesce(_active,true)) RETURNING id INTO _out;
    RETURN _out;
  END IF;
  UPDATE staff_members SET name=left(trim(_name),80),role=_role,active=coalesce(_active,active) WHERE id=_id RETURNING id INTO _out;
  IF _out IS NULL THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
  IF _new_pin IS NOT NULL AND _new_pin<>'' THEN
    _salt:=gen_random_uuid()::text;
    UPDATE staff_members SET pin_salt=_salt,pin_hash=public.pin_hash(_salt,_new_pin) WHERE id=_id;
  END IF;
  RETURN _out;
END $$;

CREATE OR REPLACE FUNCTION public.staff_member_delete(_pin text,_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM internal_require_manager(_pin);
  DELETE FROM staff_members WHERE id=_id;
END $$;

-- ============ Indstillinger ============
CREATE TABLE public.roomservice_settings(
  id integer PRIMARY KEY CHECK (id=1),
  enabled boolean NOT NULL DEFAULT true,
  opens_at time NOT NULL DEFAULT '07:00',
  closes_at time NOT NULL DEFAULT '22:00'
);
INSERT INTO public.roomservice_settings(id) VALUES(1);
GRANT SELECT ON public.roomservice_settings TO anon,authenticated;
GRANT ALL ON public.roomservice_settings TO service_role;
ALTER TABLE public.roomservice_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Roomservice settings are readable" ON public.roomservice_settings FOR SELECT TO anon,authenticated USING (true);

ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS rate_cents integer NOT NULL DEFAULT 0 CHECK (rate_cents>=0);

CREATE OR REPLACE FUNCTION public.staff_settings(_pin text) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN json_build_object(
    'wifi_ssid',(SELECT value FROM hotel_secrets WHERE key='wifi_ssid'),
    'wifi_password',(SELECT value FROM hotel_secrets WHERE key='wifi_password'),
    'roomservice',(SELECT row_to_json(s) FROM roomservice_settings s WHERE id=1),
    'me',internal_staff_who(_pin));
END $$;

CREATE OR REPLACE FUNCTION public.staff_set_wifi(_pin text,_ssid text,_password text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM internal_require_manager(_pin);
  IF length(trim(coalesce(_ssid,'')))=0 OR length(coalesce(_password,''))<8 THEN RAISE EXCEPTION 'INVALID_WIFI'; END IF;
  INSERT INTO hotel_secrets(key,value) VALUES('wifi_ssid',trim(_ssid)) ON CONFLICT(key) DO UPDATE SET value=excluded.value;
  INSERT INTO hotel_secrets(key,value) VALUES('wifi_password',_password) ON CONFLICT(key) DO UPDATE SET value=excluded.value;
END $$;

CREATE OR REPLACE FUNCTION public.staff_set_master_pin(_pin text,_new text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM internal_require_manager(_pin);
  IF _new IS NULL OR _new !~ '^[0-9]{4,8}$' THEN RAISE EXCEPTION 'INVALID_PIN'; END IF;
  IF staff_check(_new) AND _new<>_pin THEN RAISE EXCEPTION 'PIN_TAKEN'; END IF;
  UPDATE hotel_secrets SET value=_new WHERE key='staff_pin';
END $$;

CREATE OR REPLACE FUNCTION public.staff_roomservice_settings_save(_pin text,_enabled boolean,_opens time,_closes time) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE roomservice_settings SET enabled=coalesce(_enabled,enabled),opens_at=coalesce(_opens,opens_at),closes_at=coalesce(_closes,closes_at) WHERE id=1;
END $$;

CREATE OR REPLACE FUNCTION public.staff_room_rate_set(_pin text,_room text,_cents integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _cents IS NULL OR _cents<0 THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;
  UPDATE rooms SET rate_cents=_cents,updated_at=now() WHERE number=_room;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROOM_NOT_FOUND'; END IF;
END $$;

-- ============ Roomservice-menu ============
CREATE TABLE public.menu_categories(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  sort integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.menu_items(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.menu_categories(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '',
  price_cents integer NOT NULL CHECK (price_cents>=0),
  image_url text,
  active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  available_from time,
  available_to time,
  -- varianter: [{"name":"Stor","price_delta_cents":2000}] — gæsten vælger præcis én. tilvalg: [{"name":"Ekstra ost","price_cents":1500}] — gæsten vælger 0 eller flere.
  variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  addons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(variants)='array' AND jsonb_typeof(addons)='array')
);
GRANT SELECT ON public.menu_categories,public.menu_items TO anon,authenticated;
GRANT ALL ON public.menu_categories,public.menu_items TO service_role;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Menu categories are readable" ON public.menu_categories FOR SELECT TO anon,authenticated USING (true);
CREATE POLICY "Menu items are readable" ON public.menu_items FOR SELECT TO anon,authenticated USING (true);

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items,public.menu_categories,public.roomservice_settings;
  END IF;
END $$;

-- Eksempelmenu (eksempelpriser i DKK — ret dem under Roomservice i personalesiden).
WITH c AS (INSERT INTO public.menu_categories(name,sort) VALUES('Mad',1),('Snacks',2),('Drikke',3) RETURNING id,name)
INSERT INTO public.menu_items(category_id,name,description,price_cents,sort)
SELECT c.id,v.name,v.descr,v.price,v.sort FROM c JOIN (VALUES
  ('Mad','Club sandwich','Kylling, bacon, salat og tomat',14500,1),
  ('Mad','Caesar salat','Romaine, parmesan og croutoner',13500,2),
  ('Mad','Dagens suppe','Serveres med brød',9500,3),
  ('Snacks','Pommes frites','Med mayo eller ketchup',6500,1),
  ('Drikke','Flaske rødvin','75 cl, husets vin',29500,1),
  ('Drikke','Kaffe & croissant','Friskbrygget kaffe',6500,2)
) AS v(cat,name,descr,price,sort) ON v.cat=c.name;

-- Gæsteappen henter menuen her. Kun aktive kategorier og varer; "available_now" tager højde for åbningstider.
CREATE OR REPLACE FUNCTION public.guest_menu() RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT json_build_object(
    'settings',(SELECT json_build_object('enabled',s.enabled,'opens_at',to_char(s.opens_at,'HH24:MI'),'closes_at',to_char(s.closes_at,'HH24:MI'),'open_now',s.enabled AND public.in_hours(s.opens_at,s.closes_at)) FROM roomservice_settings s WHERE s.id=1),
    'categories',(SELECT coalesce(json_agg(json_build_object('id',c.id,'name',c.name,'items',
        (SELECT coalesce(json_agg(json_build_object('id',i.id,'name',i.name,'description',i.description,'price_cents',i.price_cents,'image_url',i.image_url,'variants',i.variants,'addons',i.addons,
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
    'items',(SELECT coalesce(json_agg(q ORDER BY q.sort,q.name),'[]'::json) FROM (SELECT id,category_id,name,description,price_cents,image_url,active,sort,to_char(available_from,'HH24:MI') AS available_from,to_char(available_to,'HH24:MI') AS available_to,variants,addons FROM menu_items) q));
END $$;

CREATE OR REPLACE FUNCTION public.staff_menu_category_save(_pin text,_id uuid,_name text,_sort integer,_active boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _out uuid;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _name IS NULL OR length(trim(_name))=0 THEN RAISE EXCEPTION 'INVALID_NAME'; END IF;
  IF _id IS NULL THEN
    INSERT INTO menu_categories(name,sort,active) VALUES(left(trim(_name),60),coalesce(_sort,0),coalesce(_active,true)) RETURNING id INTO _out;
  ELSE
    UPDATE menu_categories SET name=left(trim(_name),60),sort=coalesce(_sort,sort),active=coalesce(_active,active) WHERE id=_id RETURNING id INTO _out;
    IF _out IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  END IF;
  RETURN _out;
END $$;

CREATE OR REPLACE FUNCTION public.staff_menu_category_delete(_pin text,_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  DELETE FROM menu_categories WHERE id=_id;
END $$;

-- _item: {id?, category_id, name, description, price_cents, image_url, active, sort, available_from, available_to, variants[], addons[]}
CREATE OR REPLACE FUNCTION public.staff_menu_item_save(_pin text,_item jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid:=nullif(_item->>'id','')::uuid; _out uuid; v jsonb; _variants jsonb:=coalesce(_item->'variants','[]'::jsonb); _addons jsonb:=coalesce(_item->'addons','[]'::jsonb);
  _from time:=nullif(_item->>'available_from','')::time; _to time:=nullif(_item->>'available_to','')::time;
  _price integer:=(_item->>'price_cents')::integer;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF coalesce(length(trim(_item->>'name')),0)=0 THEN RAISE EXCEPTION 'INVALID_NAME'; END IF;
  IF _price IS NULL OR _price<0 THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;
  IF (_from IS NULL)<>(_to IS NULL) THEN RAISE EXCEPTION 'INVALID_HOURS'; END IF;
  IF jsonb_typeof(_variants)<>'array' OR jsonb_typeof(_addons)<>'array' THEN RAISE EXCEPTION 'INVALID_OPTIONS'; END IF;
  FOR v IN SELECT value FROM jsonb_array_elements(_variants) LOOP
    IF coalesce(length(trim(v->>'name')),0)=0 OR (v->>'price_delta_cents') IS NULL THEN RAISE EXCEPTION 'INVALID_OPTIONS'; END IF;
  END LOOP;
  FOR v IN SELECT value FROM jsonb_array_elements(_addons) LOOP
    IF coalesce(length(trim(v->>'name')),0)=0 OR (v->>'price_cents') IS NULL OR (v->>'price_cents')::integer<0 THEN RAISE EXCEPTION 'INVALID_OPTIONS'; END IF;
  END LOOP;
  IF _id IS NULL THEN
    INSERT INTO menu_items(category_id,name,description,price_cents,image_url,active,sort,available_from,available_to,variants,addons)
    VALUES((_item->>'category_id')::uuid,left(trim(_item->>'name'),100),left(coalesce(_item->>'description',''),500),_price,nullif(trim(coalesce(_item->>'image_url','')),''),coalesce((_item->>'active')::boolean,true),coalesce((_item->>'sort')::integer,0),_from,_to,_variants,_addons)
    RETURNING id INTO _out;
  ELSE
    UPDATE menu_items SET category_id=(_item->>'category_id')::uuid,name=left(trim(_item->>'name'),100),description=left(coalesce(_item->>'description',''),500),price_cents=_price,
      image_url=nullif(trim(coalesce(_item->>'image_url','')),''),active=coalesce((_item->>'active')::boolean,active),sort=coalesce((_item->>'sort')::integer,sort),
      available_from=_from,available_to=_to,variants=_variants,addons=_addons,updated_at=now()
    WHERE id=_id RETURNING id INTO _out;
    IF _out IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  END IF;
  RETURN _out;
END $$;

CREATE OR REPLACE FUNCTION public.staff_menu_item_delete(_pin text,_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  DELETE FROM menu_items WHERE id=_id;
END $$;

-- ============ Ordrer ============
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS total_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reject_reason text NOT NULL DEFAULT '';
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status IN ('pending','accepted','in_progress','ready','done','rejected','cancelled'));

-- Gæst: bestil fra menuen. Priser regnes ALTID ud på serveren ud fra menuen — klientens priser bruges ikke.
-- _lines: [{"item_id":"…","qty":2,"variant":"Stor","addons":["Ekstra ost"]}]
CREATE OR REPLACE FUNCTION public.guest_order_menu(_token uuid,_device uuid,_lines jsonb,_note text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; s roomservice_settings; ln jsonb; it menu_items; v jsonb; ad jsonb; an text; qty integer; unit integer; label text;
  out_lines jsonb:='[]'::jsonb; total integer:=0; details text:=''; note text:=left(trim(coalesce(_note,'')),200); _id uuid;
BEGIN
  b:=require_guest(_token,_device);
  SELECT * INTO s FROM roomservice_settings WHERE id=1;
  IF NOT s.enabled OR NOT in_hours(s.opens_at,s.closes_at) THEN RAISE EXCEPTION 'ROOMSERVICE_CLOSED'; END IF;
  IF _lines IS NULL OR jsonb_typeof(_lines)<>'array' OR jsonb_array_length(_lines)=0 OR jsonb_array_length(_lines)>30 THEN RAISE EXCEPTION 'EMPTY_ORDER'; END IF;
  FOR ln IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    qty:=(ln->>'qty')::integer;
    IF qty IS NULL OR qty<1 OR qty>10 THEN RAISE EXCEPTION 'INVALID_ORDER'; END IF;
    SELECT i.* INTO it FROM menu_items i JOIN menu_categories c ON c.id=i.category_id WHERE i.id=(ln->>'item_id')::uuid AND i.active AND c.active;
    IF NOT FOUND OR NOT in_hours(it.available_from,it.available_to) THEN RAISE EXCEPTION 'ITEM_UNAVAILABLE'; END IF;
    unit:=it.price_cents; label:=replace(it.name,',',' ');
    IF jsonb_array_length(it.variants)>0 THEN
      SELECT x INTO v FROM jsonb_array_elements(it.variants) x WHERE x->>'name'=ln->>'variant' LIMIT 1;
      IF v IS NULL THEN RAISE EXCEPTION 'INVALID_ORDER'; END IF;
      unit:=unit+(v->>'price_delta_cents')::integer; label:=label||' ('||replace(v->>'name',',',' ')||')';
    END IF;
    FOR an IN SELECT jsonb_array_elements_text(coalesce(ln->'addons','[]'::jsonb)) LOOP
      SELECT x INTO ad FROM jsonb_array_elements(it.addons) x WHERE x->>'name'=an LIMIT 1;
      IF ad IS NULL THEN RAISE EXCEPTION 'INVALID_ORDER'; END IF;
      unit:=unit+(ad->>'price_cents')::integer; label:=label||' + '||replace(an,',',' ');
    END LOOP;
    out_lines:=out_lines||jsonb_build_array(jsonb_build_object('item_id',it.id,'name',label,'qty',qty,'unit_cents',unit));
    total:=total+qty*unit;
    details:=details||CASE WHEN details='' THEN '' ELSE ', ' END||qty||'× '||label;
  END LOOP;
  IF note<>'' THEN details:=details||' — Note: '||note; END IF;
  INSERT INTO orders(room_number,booking_id,type,details,items,total_cents) VALUES(b.room_number,b.id,'room_service',left(details,1000),out_lines,total) RETURNING id INTO _id;
  RETURN _id;
END $$;

-- Gæst: annuller, så længe køkkenet ikke har gjort maden klar.
CREATE OR REPLACE FUNCTION public.guest_cancel_order(_token uuid,_device uuid,_order uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings;
BEGIN
  b:=require_guest(_token,_device);
  UPDATE orders SET cancelled=true,updated_at=now() WHERE id=_order AND booking_id=b.id AND NOT cancelled AND status IN ('pending','accepted','in_progress');
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_CANCELLABLE'; END IF;
END $$;

-- Gæst: orderstatus (inkl. afvist med begrundelse).
CREATE OR REPLACE FUNCTION public.guest_orders(_token uuid,_device uuid) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; result json;
BEGIN
  b:=require_guest(_token,_device);
  SELECT coalesce(json_agg(q),'[]'::json) INTO result FROM (
    SELECT id,type,details,CASE WHEN cancelled THEN 'cancelled' ELSE status END AS status,created_at,total_cents,reject_reason
    FROM orders WHERE booking_id=b.id ORDER BY created_at DESC LIMIT 20) q;
  RETURN result;
END $$;

-- Personale: alle ordrer (nyeste først), valgfrit kun fra et tidspunkt.
CREATE OR REPLACE FUNCTION public.staff_orders(_pin text,_limit integer DEFAULT 100) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN (SELECT coalesce(json_agg(q),'[]'::json) FROM (
    SELECT o.id,o.room_number,o.type,o.details,CASE WHEN o.cancelled THEN 'cancelled' ELSE o.status END AS status,o.created_at,o.updated_at,o.quantity,o.items,o.total_cents,o.paid,o.reject_reason,b.guest_name
    FROM orders o LEFT JOIN bookings b ON b.id=o.booking_id ORDER BY o.created_at DESC LIMIT least(greatest(coalesce(_limit,100),1),500)) q);
END $$;

-- ============ Gæsteregning ============
CREATE TABLE public.bill_items(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  room_number text NOT NULL,
  category text NOT NULL CHECK (category IN ('room_service','restaurant_bar','minibar','service','accommodation','other')),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 200),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 999),
  -- Kan være negativ (kreditnota/korrektion).
  unit_price_cents integer NOT NULL CHECK (unit_price_cents BETWEEN -10000000 AND 10000000),
  source text NOT NULL DEFAULT 'staff' CHECK (source IN ('staff','order','system')),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  order_line integer,
  -- Betalt i appen: tælles ikke med i beløbet, der skal betales ved checkout.
  paid boolean NOT NULL DEFAULT false,
  voided_at timestamptz,
  void_reason text,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX bill_items_order_line_uniq ON public.bill_items(order_id,order_line) WHERE order_id IS NOT NULL;
CREATE INDEX bill_items_booking_idx ON public.bill_items(booking_id);
CREATE INDEX bill_items_created_idx ON public.bill_items(created_at);
GRANT ALL ON public.bill_items TO service_role;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS checked_out_at timestamptz;

CREATE TABLE public.checkouts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  reference text NOT NULL,
  room_number text NOT NULL,
  guest_name text NOT NULL,
  guests integer NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  total_cents integer NOT NULL,
  paid_in_app_cents integer NOT NULL DEFAULT 0,
  due_cents integer NOT NULL,
  payment_method text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  checked_out_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checkouts_created_idx ON public.checkouts(created_at);
GRANT ALL ON public.checkouts TO service_role;
ALTER TABLE public.checkouts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cleaning_requests ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'guest' CHECK (kind IN ('guest','checkout'));

-- Regningens poster og samlede saldo. Annullerede poster tæller ikke med i beløbene.
CREATE OR REPLACE FUNCTION public.internal_bill(_booking uuid) RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT json_build_object(
    'booking',(SELECT json_build_object('id',b.id,'reference',b.reference,'room_number',b.room_number,'guest_name',b.guest_name,'guests',b.guests,'starts_at',b.starts_at,'ends_at',b.ends_at,'checked_in_at',b.checked_in_at,'checked_out_at',b.checked_out_at,'active',b.active,'rate_cents',r.rate_cents)
               FROM bookings b JOIN rooms r ON r.number=b.room_number WHERE b.id=_booking),
    'items',(SELECT coalesce(json_agg(q ORDER BY q.created_at,q.id),'[]'::json) FROM (SELECT id,category,description,quantity,unit_price_cents,source,order_id,paid,voided_at,void_reason,created_by,created_at FROM bill_items WHERE booking_id=_booking) q),
    'total_cents',coalesce((SELECT sum(quantity::bigint*unit_price_cents) FROM bill_items WHERE booking_id=_booking AND voided_at IS NULL),0),
    'paid_in_app_cents',coalesce((SELECT sum(quantity::bigint*unit_price_cents) FROM bill_items WHERE booking_id=_booking AND voided_at IS NULL AND paid),0),
    'due_cents',coalesce((SELECT sum(quantity::bigint*unit_price_cents) FROM bill_items WHERE booking_id=_booking AND voided_at IS NULL AND NOT paid),0))
$$;
REVOKE ALL ON FUNCTION public.internal_bill(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.staff_bill(_pin text,_booking uuid) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF NOT EXISTS(SELECT 1 FROM bookings WHERE id=_booking) THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  RETURN internal_bill(_booking);
END $$;

-- Gæsten ser sin egen regning (uden interne noter).
CREATE OR REPLACE FUNCTION public.guest_bill(_token uuid,_device uuid) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings;
BEGIN
  b:=require_guest(_token,_device);
  RETURN json_build_object(
    'items',(SELECT coalesce(json_agg(q ORDER BY q.created_at),'[]'::json) FROM (SELECT id,category,description,quantity,unit_price_cents,paid,created_at FROM bill_items WHERE booking_id=b.id AND voided_at IS NULL) q),
    'total_cents',coalesce((SELECT sum(quantity::bigint*unit_price_cents) FROM bill_items WHERE booking_id=b.id AND voided_at IS NULL),0),
    'due_cents',coalesce((SELECT sum(quantity::bigint*unit_price_cents) FROM bill_items WHERE booking_id=b.id AND voided_at IS NULL AND NOT paid),0));
END $$;

-- Intern: opret post på et ophold, der ikke er checket ud.
CREATE OR REPLACE FUNCTION public.internal_bill_add(_pin text,_booking uuid,_category text,_description text,_qty integer,_unit integer,_source text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; _id uuid;
BEGIN
  SELECT * INTO b FROM bookings WHERE id=_booking;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  IF b.checked_out_at IS NOT NULL THEN RAISE EXCEPTION 'BILL_CLOSED'; END IF;
  IF _category NOT IN ('room_service','restaurant_bar','minibar','service','accommodation','other') THEN RAISE EXCEPTION 'INVALID_CATEGORY'; END IF;
  IF _description IS NULL OR length(trim(_description))=0 THEN RAISE EXCEPTION 'INVALID_NAME'; END IF;
  IF _qty IS NULL OR _qty<1 OR _qty>999 THEN RAISE EXCEPTION 'INVALID_QTY'; END IF;
  IF _unit IS NULL OR _unit<-10000000 OR _unit>10000000 THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;
  INSERT INTO bill_items(booking_id,room_number,category,description,quantity,unit_price_cents,source,created_by)
  VALUES(b.id,b.room_number,_category,left(trim(_description),200),_qty,_unit,_source,coalesce(internal_staff_who(_pin)->>'name','')) RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.internal_bill_add(text,uuid,text,text,integer,integer,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.staff_bill_add(_pin text,_booking uuid,_category text,_description text,_qty integer,_unit_cents integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN internal_bill_add(_pin,_booking,_category,_description,_qty,_unit_cents,'staff');
END $$;

-- Salg på et værelsesnummer: lægges på det ophold, der er i gang i værelset lige nu.
CREATE OR REPLACE FUNCTION public.staff_bill_add_room(_pin text,_room text,_category text,_description text,_qty integer,_unit_cents integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO b FROM bookings WHERE room_number=trim(_room) AND active AND checked_out_at IS NULL AND starts_at<=now() AND ends_at>now() ORDER BY starts_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_STAY'; END IF;
  RETURN internal_bill_add(_pin,b.id,_category,_description,_qty,_unit_cents,'staff');
END $$;

CREATE OR REPLACE FUNCTION public.staff_bill_edit(_pin text,_item uuid,_category text,_description text,_qty integer,_unit_cents integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE it bill_items;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO it FROM bill_items WHERE id=_item FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF EXISTS(SELECT 1 FROM bookings WHERE id=it.booking_id AND checked_out_at IS NOT NULL) THEN RAISE EXCEPTION 'BILL_CLOSED'; END IF;
  IF it.voided_at IS NOT NULL THEN RAISE EXCEPTION 'ITEM_VOIDED'; END IF;
  IF _category NOT IN ('room_service','restaurant_bar','minibar','service','accommodation','other') THEN RAISE EXCEPTION 'INVALID_CATEGORY'; END IF;
  IF _description IS NULL OR length(trim(_description))=0 THEN RAISE EXCEPTION 'INVALID_NAME'; END IF;
  IF _qty IS NULL OR _qty<1 OR _qty>999 THEN RAISE EXCEPTION 'INVALID_QTY'; END IF;
  IF _unit_cents IS NULL OR _unit_cents<-10000000 OR _unit_cents>10000000 THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;
  UPDATE bill_items SET category=_category,description=left(trim(_description),200),quantity=_qty,unit_price_cents=_unit_cents,updated_at=now() WHERE id=_item;
END $$;

-- Annuller en post (den bliver stående på regningen som annulleret, så historikken er intakt).
CREATE OR REPLACE FUNCTION public.staff_bill_void(_pin text,_item uuid,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE it bill_items;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO it FROM bill_items WHERE id=_item FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF EXISTS(SELECT 1 FROM bookings WHERE id=it.booking_id AND checked_out_at IS NOT NULL) THEN RAISE EXCEPTION 'BILL_CLOSED'; END IF;
  IF it.voided_at IS NOT NULL THEN RETURN; END IF;
  UPDATE bill_items SET voided_at=now(),void_reason=left(coalesce(_reason,''),200),updated_at=now() WHERE id=_item;
END $$;

-- Overnatning: antal nætter × værelsets pris (sættes under Værelser).
CREATE OR REPLACE FUNCTION public.staff_bill_add_accommodation(_pin text,_booking uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; r rooms; n integer;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO b FROM bookings WHERE id=_booking;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  SELECT * INTO r FROM rooms WHERE number=b.room_number;
  IF r.rate_cents<=0 THEN RAISE EXCEPTION 'NO_ROOM_RATE'; END IF;
  IF EXISTS(SELECT 1 FROM bill_items WHERE booking_id=_booking AND category='accommodation' AND voided_at IS NULL) THEN RAISE EXCEPTION 'ALREADY_ADDED'; END IF;
  -- Antal nætter = forskel i kalenderdage (dansk tid), mindst 1.
  n:=greatest(1,(b.ends_at AT TIME ZONE 'Europe/Copenhagen')::date-(b.starts_at AT TIME ZONE 'Europe/Copenhagen')::date);
  RETURN internal_bill_add(_pin,_booking,'accommodation','Overnatning, værelse '||b.room_number||' ('||n||CASE WHEN n=1 THEN ' nat)' ELSE ' nætter)' END,n,r.rate_cents,'staff');
END $$;

-- Ordrestatus. Leveret roomservice lægges automatisk på gæstens regning, medmindre den er betalt i appen.
DROP FUNCTION IF EXISTS public.staff_set_order_status(text,uuid,text);
CREATE OR REPLACE FUNCTION public.staff_set_order_status(_pin text,_order uuid,_status text,_reason text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o orders;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _status NOT IN ('pending','accepted','in_progress','ready','done','rejected') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  SELECT * INTO o FROM orders WHERE id=_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF o.cancelled OR o.status IN ('cancelled','done','rejected') THEN RAISE EXCEPTION 'ORDER_CLOSED'; END IF;
  UPDATE orders SET status=_status,updated_at=now(),reject_reason=CASE WHEN _status='rejected' THEN left(coalesce(_reason,''),200) ELSE reject_reason END WHERE id=_order;
  IF _status='done' AND o.type='room_service' AND o.booking_id IS NOT NULL AND NOT o.paid THEN
    INSERT INTO bill_items(booking_id,room_number,category,description,quantity,unit_price_cents,source,order_id,order_line,created_by)
    SELECT o.booking_id,o.room_number,'room_service',left(l->>'name',200),(l->>'qty')::integer,(l->>'unit_cents')::integer,'order',o.id,(idx)::integer,coalesce(internal_staff_who(_pin)->>'name','')
    FROM jsonb_array_elements(o.items) WITH ORDINALITY AS t(l,idx)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============ Checkout ============
-- Afslutter opholdet, gemmer regningen i historikken, sætter værelset til rengøring og opretter rengøringsopgaven.
-- HotelPilot tager ikke imod betaling: _method er hvordan regningen blev betalt i hotellets eget betalingssystem.
CREATE OR REPLACE FUNCTION public.staff_checkout(_pin text,_booking uuid,_method text,_note text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; bill json; _total bigint; _paid bigint; _due bigint; _id uuid; _who text;
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
  UPDATE bookings SET checked_out_at=now(),ends_at=least(ends_at,now()) WHERE id=b.id;
  UPDATE rooms SET housekeeping_status='needs_cleaning',cleaning_booking_id=b.id,exchange_towels=true,updated_at=now() WHERE number=b.room_number;
  IF EXISTS(SELECT 1 FROM cleaning_requests WHERE booking_id=b.id AND status IN ('requested','in_progress')) THEN
    UPDATE cleaning_requests SET kind='checkout',wants_towels=true,towel_count=b.guests,updated_at=now() WHERE booking_id=b.id AND status IN ('requested','in_progress');
  ELSE
    INSERT INTO cleaning_requests(booking_id,room_number,wants_towels,towel_count,status,kind) VALUES(b.id,b.room_number,true,b.guests,'requested','checkout');
  END IF;
  RETURN _id;
END $$;

-- Rengøring: afrejse-opgaver kan ikke markeres "ikke nået" (værelset er tomt og skal rengøres).
CREATE OR REPLACE FUNCTION public.staff_set_cleaning(_pin text,_request uuid,_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _room text; _kind text;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _status NOT IN ('in_progress','done','not_reached') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  SELECT kind INTO _kind FROM cleaning_requests WHERE id=_request;
  IF _kind='checkout' AND _status='not_reached' THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  UPDATE cleaning_requests SET status=_status,updated_at=now() WHERE id=_request AND status IN ('requested','in_progress') RETURNING room_number INTO _room;
  IF _room IS NULL THEN RAISE EXCEPTION 'REQUEST_CLOSED'; END IF;
  UPDATE rooms SET
    housekeeping_status=CASE _status WHEN 'in_progress' THEN 'cleaning' WHEN 'done' THEN 'clean' ELSE 'occupied' END,
    cleaning_booking_id=CASE WHEN _status='not_reached' THEN NULL ELSE cleaning_booking_id END,
    exchange_towels=CASE WHEN _status='not_reached' THEN false ELSE exchange_towels END,
    updated_at=now()
  WHERE number=_room;
END $$;

CREATE OR REPLACE FUNCTION public.staff_cleaning(_pin text) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN json_build_object('requests',(SELECT coalesce(json_agg(q),'[]'::json) FROM (
    SELECT c.id,c.room_number,b.guest_name,c.wants_towels,c.towel_count,c.away_from,c.away_until,c.status,c.is_repeat,c.kind,c.created_at,c.updated_at
    FROM cleaning_requests c JOIN bookings b ON b.id=c.booking_id
    WHERE c.status IN ('requested','in_progress') OR c.updated_at>now()-interval '12 hours'
    ORDER BY c.created_at DESC LIMIT 100) q));
END $$;

-- ============ Historik ============
-- _kind: 'checkouts' (afsluttede regninger), 'sales' (alle poster på regninger) eller 'orders'. _q søger i gæst, værelse og bookingnummer.
CREATE OR REPLACE FUNCTION public.staff_history(_pin text,_kind text,_q text,_from date,_to date) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE q text:='%'||lower(trim(coalesce(_q,'')))||'%';
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _kind='checkouts' THEN
    RETURN (SELECT coalesce(json_agg(r ORDER BY r.created_at DESC),'[]'::json) FROM (
      SELECT c.id,c.booking_id,c.reference,c.room_number,c.guest_name,c.guests,c.starts_at,c.ends_at,c.total_cents,c.paid_in_app_cents,c.due_cents,c.payment_method,c.note,c.items,c.checked_out_by,c.created_at
      FROM checkouts c WHERE lower(c.guest_name||' '||c.room_number||' '||c.reference) LIKE q
        AND (c.created_at AT TIME ZONE 'Europe/Copenhagen')::date BETWEEN coalesce(_from,'0001-01-01'::date) AND coalesce(_to,'9999-12-31'::date)
      ORDER BY c.created_at DESC LIMIT 300) r);
  ELSIF _kind='sales' THEN
    RETURN (SELECT coalesce(json_agg(r ORDER BY r.created_at DESC),'[]'::json) FROM (
      SELECT i.id,i.booking_id,i.room_number,i.category,i.description,i.quantity,i.unit_price_cents,i.source,i.paid,i.voided_at,i.void_reason,i.created_by,i.created_at,b.guest_name,b.reference
      FROM bill_items i JOIN bookings b ON b.id=i.booking_id WHERE lower(b.guest_name||' '||i.room_number||' '||b.reference||' '||i.description) LIKE q
        AND (i.created_at AT TIME ZONE 'Europe/Copenhagen')::date BETWEEN coalesce(_from,'0001-01-01'::date) AND coalesce(_to,'9999-12-31'::date)
      ORDER BY i.created_at DESC LIMIT 300) r);
  ELSIF _kind='orders' THEN
    RETURN (SELECT coalesce(json_agg(r ORDER BY r.created_at DESC),'[]'::json) FROM (
      SELECT o.id,o.room_number,o.type,o.details,CASE WHEN o.cancelled THEN 'cancelled' ELSE o.status END AS status,o.total_cents,o.created_at,o.updated_at,o.reject_reason,b.guest_name,b.reference
      FROM orders o LEFT JOIN bookings b ON b.id=o.booking_id WHERE lower(coalesce(b.guest_name,'')||' '||o.room_number||' '||coalesce(b.reference,'')||' '||o.details) LIKE q
        AND (o.created_at AT TIME ZONE 'Europe/Copenhagen')::date BETWEEN coalesce(_from,'0001-01-01'::date) AND coalesce(_to,'9999-12-31'::date)
      ORDER BY o.created_at DESC LIMIT 300) r);
  END IF;
  RAISE EXCEPTION 'INVALID_KIND';
END $$;

-- ============ Overblik ============
-- Gæster der bor på hotellet eller ankommer, med saldo.
CREATE OR REPLACE FUNCTION public.staff_guests(_pin text) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN (SELECT coalesce(json_agg(q ORDER BY q.starts_at),'[]'::json) FROM (
    SELECT b.id,b.reference,b.room_number,b.guest_name,b.guest_email,b.guests,b.starts_at,b.ends_at,b.checked_in_at,
      coalesce((SELECT sum(i.quantity::bigint*i.unit_price_cents) FROM bill_items i WHERE i.booking_id=b.id AND i.voided_at IS NULL),0) AS balance_cents,
      (b.starts_at<=now() AND b.ends_at>now()) AS in_house
    FROM bookings b WHERE b.active AND b.checked_out_at IS NULL AND b.ends_at>now()) q);
END $$;

CREATE OR REPLACE FUNCTION public.staff_rooms(_pin text) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN (SELECT coalesce(json_agg(q ORDER BY q.number),'[]'::json) FROM (
    SELECT r.number,r.floor,r.capacity,r.housekeeping_status,r.rate_cents,
      (SELECT b.guest_name FROM bookings b WHERE b.room_number=r.number AND b.active AND b.checked_out_at IS NULL AND b.starts_at<=now() AND b.ends_at>now() ORDER BY b.starts_at DESC LIMIT 1) AS guest_name,
      (SELECT b.id FROM bookings b WHERE b.room_number=r.number AND b.active AND b.checked_out_at IS NULL AND b.starts_at<=now() AND b.ends_at>now() ORDER BY b.starts_at DESC LIMIT 1) AS booking_id,
      (SELECT b.ends_at FROM bookings b WHERE b.room_number=r.number AND b.active AND b.checked_out_at IS NULL AND b.starts_at<=now() AND b.ends_at>now() ORDER BY b.starts_at DESC LIMIT 1) AS ends_at
    FROM rooms r) q);
END $$;

CREATE OR REPLACE FUNCTION public.staff_dashboard(_pin text) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE today date:=(now() AT TIME ZONE 'Europe/Copenhagen')::date; total_rooms integer; occupied integer;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT count(*) INTO total_rooms FROM rooms;
  SELECT count(DISTINCT room_number) INTO occupied FROM bookings WHERE active AND checked_out_at IS NULL AND starts_at<=now() AND ends_at>now();
  RETURN json_build_object(
    'arrivals',(SELECT coalesce(json_agg(q ORDER BY q.starts_at),'[]'::json) FROM (SELECT id,room_number,guest_name,guests,starts_at,checked_in_at FROM bookings WHERE active AND checked_out_at IS NULL AND (starts_at AT TIME ZONE 'Europe/Copenhagen')::date=today) q),
    'departures',(SELECT coalesce(json_agg(q ORDER BY q.ends_at),'[]'::json) FROM (SELECT id,room_number,guest_name,guests,ends_at,checked_out_at FROM bookings WHERE active AND starts_at<=now() AND (ends_at AT TIME ZONE 'Europe/Copenhagen')::date=today AND (checked_out_at IS NULL OR (checked_out_at AT TIME ZONE 'Europe/Copenhagen')::date=today)) q),
    'rooms_total',total_rooms,'occupied',occupied,'free',greatest(total_rooms-occupied,0),
    'rooms_to_clean',(SELECT count(*) FROM rooms WHERE housekeeping_status IN ('needs_cleaning','cleaning')),
    'open_tasks',(SELECT count(*) FROM cleaning_requests WHERE status IN ('requested','in_progress')),
    'new_orders',(SELECT count(*) FROM orders WHERE status='pending' AND NOT cancelled),
    'open_orders',(SELECT count(*) FROM orders WHERE status IN ('pending','accepted','in_progress','ready') AND NOT cancelled),
    'revenue_today_cents',coalesce((SELECT sum(quantity::bigint*unit_price_cents) FROM bill_items WHERE voided_at IS NULL AND (created_at AT TIME ZONE 'Europe/Copenhagen')::date=today),0),
    'unsettled_cents',coalesce((SELECT sum(i.quantity::bigint*i.unit_price_cents) FROM bill_items i JOIN bookings b ON b.id=i.booking_id WHERE i.voided_at IS NULL AND NOT i.paid AND b.checked_out_at IS NULL),0));
END $$;

-- Statistik: omsætning pr. dag og kategori, populære varer og ratings.
CREATE OR REPLACE FUNCTION public.staff_stats(_pin text,_days integer DEFAULT 14) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE d integer:=least(greatest(coalesce(_days,14),1),365); since date:=(now() AT TIME ZONE 'Europe/Copenhagen')::date-(least(greatest(coalesce(_days,14),1),365)-1);
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN json_build_object(
    'days',d,
    'revenue_by_day',(SELECT coalesce(json_agg(q ORDER BY q.day),'[]'::json) FROM (SELECT (created_at AT TIME ZONE 'Europe/Copenhagen')::date AS day,sum(quantity::bigint*unit_price_cents) AS cents FROM bill_items WHERE voided_at IS NULL AND (created_at AT TIME ZONE 'Europe/Copenhagen')::date>=since GROUP BY 1) q),
    'revenue_by_category',(SELECT coalesce(json_agg(q ORDER BY q.cents DESC),'[]'::json) FROM (SELECT category,sum(quantity::bigint*unit_price_cents) AS cents FROM bill_items WHERE voided_at IS NULL AND (created_at AT TIME ZONE 'Europe/Copenhagen')::date>=since GROUP BY 1) q),
    'top_items',(SELECT coalesce(json_agg(q),'[]'::json) FROM (SELECT description,sum(quantity)::integer AS qty,sum(quantity::bigint*unit_price_cents) AS cents FROM bill_items WHERE voided_at IS NULL AND category IN ('room_service','restaurant_bar','minibar') AND (created_at AT TIME ZONE 'Europe/Copenhagen')::date>=since GROUP BY 1 ORDER BY qty DESC LIMIT 8) q),
    'orders_by_status',(SELECT coalesce(json_agg(q),'[]'::json) FROM (SELECT CASE WHEN cancelled THEN 'cancelled' ELSE status END AS status,count(*)::integer AS n FROM orders WHERE (created_at AT TIME ZONE 'Europe/Copenhagen')::date>=since GROUP BY 1) q),
    'rating_avg',(SELECT round(avg(rating)::numeric,1) FROM guest_feedback WHERE (created_at AT TIME ZONE 'Europe/Copenhagen')::date>=since),
    'rating_count',(SELECT count(*) FROM guest_feedback WHERE (created_at AT TIME ZONE 'Europe/Copenhagen')::date>=since),
    'checkouts',(SELECT count(*) FROM checkouts WHERE (created_at AT TIME ZONE 'Europe/Copenhagen')::date>=since));
END $$;

-- ============ Rettigheder ============
DO $$ DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND (p.proname LIKE 'staff\_%' OR p.proname IN ('guest_menu','guest_order_menu','guest_bill','guest_cancel_order','guest_orders'))
  LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION '||f.sig||' FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION '||f.sig||' TO anon,authenticated';
  END LOOP;
END $$;
