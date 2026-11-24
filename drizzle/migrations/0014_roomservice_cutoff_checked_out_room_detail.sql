-- Roomservice lukker 2 timer før opholdet slutter, anmeldelser ud af gæsteinfo, overblik over tjekkede ud og fuld rumvisning.

CREATE OR REPLACE FUNCTION public.guest_order_menu(_token uuid,_device uuid,_lines jsonb,_note text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bookings; s roomservice_settings; ln jsonb; it menu_items; v jsonb; ad jsonb; an text; qty integer; unit integer; label text;
  out_lines jsonb:='[]'::jsonb; total integer:=0; details text:=''; note text:=left(trim(coalesce(_note,'')),200); _id uuid;
BEGIN
  b:=require_guest(_token,_device);
  -- Roomservice lukker 2 timer før opholdet slutter.
  IF now()>=b.ends_at-interval '2 hours' THEN RAISE EXCEPTION 'ROOMSERVICE_STAY_ENDING'; END IF;
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
      'timeline',(SELECT coalesce(json_agg(t ORDER BY t.at DESC),'[]'::json) FROM (
        SELECT d.created_at AS at,'device'::text AS kind,'Ny enhed tilknyttet rummet'::text AS text FROM devices d WHERE d.booking_id=b.id
        UNION ALL SELECT b.checked_in_at,'checkin','Tjekket ind' WHERE b.checked_in_at IS NOT NULL
        UNION ALL SELECT d.last_unlock_at,'unlock','Låste døren op (i alt '||d.unlock_count||' gange)' FROM devices d WHERE d.booking_id=b.id AND d.last_unlock_at IS NOT NULL
        UNION ALL SELECT o.created_at,'order',CASE WHEN o.type='towels' THEN 'Bestilte '||o.quantity||' håndklæder' ELSE 'Bestilte roomservice: '||left(o.details,90) END FROM orders o WHERE o.booking_id=b.id AND NOT o.cancelled
        UNION ALL SELECT c.created_at,'cleaning','Bestilte rengøring' FROM cleaning_requests c WHERE c.booking_id=b.id AND c.kind='guest'
        ORDER BY at DESC LIMIT 40) t)));
END $$;

-- Personale: gæster der er tjekket ud (til "Tjekket ud" under Ankomster & afrejser). _days=1 er i dag, 7 er de seneste 7 dage.
CREATE OR REPLACE FUNCTION public.staff_checked_out(_pin text,_days integer DEFAULT 1) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE d integer:=least(greatest(coalesce(_days,1),1),3650); since date:=(now() AT TIME ZONE 'Europe/Copenhagen')::date-(least(greatest(coalesce(_days,1),1),3650)-1);
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN (SELECT coalesce(json_agg(q ORDER BY q.checked_out_at DESC),'[]'::json) FROM (
    SELECT b.id,b.reference,b.room_number,b.guest_name,b.guests,b.starts_at,b.ends_at,b.checked_out_at,
      c.total_cents,c.due_cents,c.payment_method,c.checked_out_by,r.housekeeping_status
    FROM bookings b JOIN rooms r ON r.number=b.room_number LEFT JOIN checkouts c ON c.booking_id=b.id
    WHERE b.checked_out_at IS NOT NULL AND (b.checked_out_at AT TIME ZONE 'Europe/Copenhagen')::date>=since
    ORDER BY b.checked_out_at DESC LIMIT 300) q);
END $$;

-- Alt om ét værelse: lejeperiode, gæster, adgang i appen, status, regning, åbne ordrer og opgaver, næste og seneste gæst.
CREATE OR REPLACE FUNCTION public.staff_room_detail(_pin text,_room text) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r rooms; b bookings; nb bookings; lc record; v_due bigint; v_tot bigint; v_paid bigint; v_cnt integer;
BEGIN
  IF NOT staff_check(_pin) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO r FROM rooms WHERE number=_room;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROOM_NOT_FOUND'; END IF;
  -- Nuværende ophold (eller et overskredet, der ikke er tjekket ud)
  SELECT * INTO b FROM bookings x WHERE x.room_number=_room AND x.active AND x.checked_out_at IS NULL AND x.starts_at<=now() AND x.ends_at>now()-interval '7 days' ORDER BY x.starts_at DESC LIMIT 1;
  SELECT * INTO nb FROM bookings x WHERE x.room_number=_room AND x.active AND x.checked_out_at IS NULL AND x.starts_at>now() ORDER BY x.starts_at LIMIT 1;
  SELECT g.guest_name,g.reference,g.checked_out_at INTO lc FROM bookings g WHERE g.room_number=_room AND g.checked_out_at IS NOT NULL ORDER BY g.checked_out_at DESC LIMIT 1;
  IF b.id IS NOT NULL THEN
    SELECT coalesce(sum(quantity::bigint*unit_price_cents),0),coalesce(sum(quantity::bigint*unit_price_cents) FILTER (WHERE paid),0),coalesce(sum(quantity::bigint*unit_price_cents) FILTER (WHERE NOT paid),0),count(*)::integer
      INTO v_tot,v_paid,v_due,v_cnt FROM bill_items WHERE booking_id=b.id AND voided_at IS NULL;
  END IF;
  RETURN json_build_object(
    'room',json_build_object('number',r.number,'floor',r.floor,'capacity',r.capacity,'housekeeping_status',r.housekeeping_status,'rate_cents',r.rate_cents),
    'stay',CASE WHEN b.id IS NULL THEN NULL ELSE json_build_object('id',b.id,'reference',b.reference,'guest_name',b.guest_name,'guest_email',b.guest_email,'guests',b.guests,'starts_at',b.starts_at,'ends_at',b.ends_at,'checked_in_at',b.checked_in_at,
      'overdue',(b.ends_at<=now()),
      'nights',greatest(1,(b.ends_at AT TIME ZONE 'Europe/Copenhagen')::date-(b.starts_at AT TIME ZONE 'Europe/Copenhagen')::date),
      'devices',(SELECT count(*) FROM devices d WHERE d.booking_id=b.id),'devices_max',b.guests+2,
      'last_seen_at',(SELECT max(d.last_seen_at) FROM devices d WHERE d.booking_id=b.id)) END,
    'bill',CASE WHEN b.id IS NULL THEN NULL ELSE json_build_object('total_cents',v_tot,'paid_cents',v_paid,'due_cents',v_due,'items',v_cnt) END,
    'orders',CASE WHEN b.id IS NULL THEN '[]'::json ELSE (SELECT coalesce(json_agg(o ORDER BY o.created_at),'[]'::json) FROM (SELECT id,type,details,status,quantity,total_cents,created_at FROM orders WHERE booking_id=b.id AND NOT cancelled AND status IN ('pending','accepted','in_progress','ready')) o) END,
    'cleaning',(SELECT coalesce(json_agg(c ORDER BY c.created_at),'[]'::json) FROM (SELECT id,status,kind,created_at,away_from,away_until FROM cleaning_requests WHERE room_number=_room AND status IN ('requested','in_progress')) c),
    'next_booking',CASE WHEN nb.id IS NULL THEN NULL ELSE json_build_object('id',nb.id,'guest_name',nb.guest_name,'reference',nb.reference,'guests',nb.guests,'starts_at',nb.starts_at,'ends_at',nb.ends_at) END,
    'last_checkout',CASE WHEN lc.guest_name IS NULL THEN NULL ELSE json_build_object('guest_name',lc.guest_name,'reference',lc.reference,'checked_out_at',lc.checked_out_at) END);
END $$;

DO $$ DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND (p.proname LIKE 'staff\_%' OR p.proname='guest_order_menu')
  LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION '||f.sig||' FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION '||f.sig||' TO anon,authenticated';
  END LOOP;
END $$;
