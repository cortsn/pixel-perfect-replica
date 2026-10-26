CREATE TABLE public.rooms (
  number text PRIMARY KEY,
  floor int NOT NULL,
  capacity int NOT NULL DEFAULT 2,
  housekeeping_status text NOT NULL DEFAULT 'clean' CHECK (housekeeping_status IN ('occupied','needs_cleaning','cleaning','clean')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rooms TO anon, authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Rooms are readable" ON public.rooms FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  room_number text NOT NULL REFERENCES public.rooms(number),
  guest_name text NOT NULL,
  access_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  active boolean NOT NULL DEFAULT true
);
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.devices TO service_role;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_number text NOT NULL REFERENCES public.rooms(number),
  type text NOT NULL CHECK (type IN ('towels','room_service')),
  details text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.orders TO anon, authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Orders are readable" ON public.orders FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  starts_at time NOT NULL,
  location text NOT NULL,
  description text NOT NULL DEFAULT ''
);
GRANT SELECT ON public.events TO anon, authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Events are readable" ON public.events FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.hotel_secrets (
  key text PRIMARY KEY,
  value text NOT NULL
);
GRANT ALL ON public.hotel_secrets TO service_role;
ALTER TABLE public.hotel_secrets ENABLE ROW LEVEL SECURITY;

ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;

-- Guest functions
CREATE OR REPLACE FUNCTION public.guest_info(_b public.bookings, _device uuid)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'access_token', _b.access_token,
    'device_id', _device,
    'guest_name', _b.guest_name,
    'room_number', _b.room_number,
    'reference', _b.reference,
    'capacity', r.capacity,
    'max_devices', r.capacity + 2,
    'devices', (SELECT count(*) FROM devices d WHERE d.booking_id = _b.id),
    'housekeeping_status', r.housekeeping_status,
    'wifi_ssid', (SELECT value FROM hotel_secrets WHERE key = 'wifi_ssid'),
    'wifi_password', (SELECT value FROM hotel_secrets WHERE key = 'wifi_password')
  ) FROM rooms r WHERE r.number = _b.room_number
$$;
REVOKE EXECUTE ON FUNCTION public.guest_info(public.bookings, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_device(_b public.bookings)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cap int; _count int; _id uuid;
BEGIN
  SELECT capacity + 2 INTO _cap FROM rooms WHERE number = _b.room_number;
  SELECT count(*) INTO _count FROM devices WHERE booking_id = _b.id;
  IF _count >= _cap THEN RAISE EXCEPTION 'DEVICE_LIMIT'; END IF;
  INSERT INTO devices (booking_id) VALUES (_b.id) RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE EXECUTE ON FUNCTION public.register_device(public.bookings) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guest_login(_reference text, _room text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _b bookings;
BEGIN
  SELECT * INTO _b FROM bookings WHERE upper(trim(reference)) = upper(trim(_reference)) AND room_number = trim(_room) AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_LOGIN'; END IF;
  RETURN guest_info(_b, register_device(_b));
END $$;

CREATE OR REPLACE FUNCTION public.guest_join(_token uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _b bookings;
BEGIN
  SELECT * INTO _b FROM bookings WHERE access_token = _token AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_LOGIN'; END IF;
  RETURN guest_info(_b, register_device(_b));
END $$;

CREATE OR REPLACE FUNCTION public.guest_session(_token uuid, _device uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _b bookings;
BEGIN
  SELECT b.* INTO _b FROM bookings b JOIN devices d ON d.booking_id = b.id
   WHERE b.access_token = _token AND d.id = _device AND b.active;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_LOGIN'; END IF;
  RETURN guest_info(_b, _device);
END $$;

CREATE OR REPLACE FUNCTION public.guest_order(_token uuid, _device uuid, _type text, _details text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _room text; _id uuid;
BEGIN
  SELECT b.room_number INTO _room FROM bookings b JOIN devices d ON d.booking_id = b.id
   WHERE b.access_token = _token AND d.id = _device AND b.active;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_LOGIN'; END IF;
  INSERT INTO orders (room_number, type, details) VALUES (_room, _type, left(coalesce(_details,''), 500)) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.guest_set_housekeeping(_token uuid, _device uuid, _requested boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _room text; _status text;
BEGIN
  SELECT b.room_number INTO _room FROM bookings b JOIN devices d ON d.booking_id = b.id
   WHERE b.access_token = _token AND d.id = _device AND b.active;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_LOGIN'; END IF;
  _status := CASE WHEN _requested THEN 'needs_cleaning' ELSE 'occupied' END;
  UPDATE rooms SET housekeeping_status = _status, updated_at = now() WHERE number = _room;
  RETURN _status;
END $$;

-- Staff functions
CREATE OR REPLACE FUNCTION public.staff_check(_pin text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM hotel_secrets WHERE key = 'staff_pin' AND value = _pin)
$$;

CREATE OR REPLACE FUNCTION public.staff_set_order_status(_pin text, _order uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE orders SET status = _status WHERE id = _order;
END $$;

CREATE OR REPLACE FUNCTION public.staff_set_room_status(_pin text, _room text, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE rooms SET housekeeping_status = _status, updated_at = now() WHERE number = _room;
END $$;

-- Seed
INSERT INTO public.hotel_secrets (key, value) VALUES
 ('wifi_ssid','HotelPilot_Guest'), ('wifi_password','Nordlys2026'), ('staff_pin','1234');

INSERT INTO public.rooms (number, floor, capacity, housekeeping_status) VALUES
 ('101',1,2,'occupied'),('102',1,2,'clean'),('103',1,3,'needs_cleaning'),('104',1,2,'clean'),
 ('201',2,2,'occupied'),('202',2,4,'cleaning'),('203',2,2,'occupied'),('204',2,2,'clean'),
 ('301',3,2,'needs_cleaning'),('302',3,2,'occupied'),('303',3,3,'clean'),('304',3,4,'occupied');

INSERT INTO public.bookings (reference, room_number, guest_name) VALUES
 ('HP-1001','101','Sofie Larsen'), ('HP-2001','201','Mads Jensen'), ('HP-3002','302','Emma Nielsen'), ('HP-3004','304','Familien Holm');

INSERT INTO public.events (title, starts_at, location, description) VALUES
 ('Morgenyoga','07:30','Taghaven','Rolig vinyasa med udsigt over byen'),
 ('Brunch-buffet','10:00','Restaurant Lys','Lokale råvarer og nybagt brød'),
 ('Byvandring','14:00','Lobbyen','Guidet tur gennem de gamle kvarterer'),
 ('Vinsmagning','18:00','Vinkælderen','Fem naturvine fra Loire'),
 ('Jazz i baren','21:00','Bar Nord','Live trio og signaturcocktails');

INSERT INTO public.orders (room_number, type, details, status) VALUES
 ('203','towels','2 badehåndklæder','pending'),
 ('302','room_service','Club sandwich, 1 flaske mineralvand','in_progress');