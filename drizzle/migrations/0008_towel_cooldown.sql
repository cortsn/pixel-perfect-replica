-- Håndklæder kan kun bestilles 1 gang hver 12. time pr. ophold (annullerede bestillinger tæller ikke).
CREATE OR REPLACE FUNCTION public.guest_order_towels(_token uuid,_device uuid,_qty integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; _id uuid;
BEGIN
  b:=require_guest(_token,_device);
  IF _qty IS NULL OR _qty<1 OR _qty>b.guests THEN RAISE EXCEPTION 'TOWEL_LIMIT'; END IF;
  IF EXISTS(SELECT 1 FROM orders WHERE booking_id=b.id AND type='towels' AND status<>'cancelled' AND NOT coalesce(cancelled,false) AND created_at>now()-interval '12 hours') THEN RAISE EXCEPTION 'TOWEL_COOLDOWN'; END IF;
  INSERT INTO orders(room_number,booking_id,type,details,quantity) VALUES(b.room_number,b.id,'towels',_qty||' håndklæder til bytte',_qty) RETURNING id INTO _id;
  RETURN _id;
END $$;
