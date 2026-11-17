-- Måltidsvalg (morgenmad, frokost, aftensmad) nulstilles hver nat kl. 00.00 dansk tid.
-- pg_cron kører i UTC, så jobbet kører hver time og nulstiller kun, når klokken er 00 i Europa/København
-- (det håndterer sommer- og vintertid automatisk).
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.unschedule('reset-meal-choices') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='reset-meal-choices');
SELECT cron.schedule('reset-meal-choices','0 * * * *',$$
  UPDATE public.bookings SET breakfast_choice=NULL,lunch_choice=NULL,dinner_choice=NULL
  WHERE extract(hour FROM (now() AT TIME ZONE 'Europe/Copenhagen'))=0
    AND (breakfast_choice IS NOT NULL OR lunch_choice IS NOT NULL OR dinner_choice IS NOT NULL);
$$);
