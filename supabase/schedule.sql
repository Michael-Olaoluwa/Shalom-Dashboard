-- =============================================================================
-- Weekly digest schedule
--
-- Run this ONCE in the Supabase SQL Editor, AFTER deploying the send-digest
-- function and setting its secrets. See README §6 for the exact order.
--
-- Replace the two placeholders below before running:
--   PROJECT_URL   -> your Supabase project URL
--   CRON_SECRET   -> a long random string, e.g. `openssl rand -hex 32`
--                    (must match the CRON_SECRET secret on the function)
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Unsubscribe first so re-running this script does not stack up duplicate jobs.
select cron.unschedule('weekly-celebration-digest');

-- Every Monday at 06:00 UTC. Adjust the hour for your timezone: 07:00 local in
-- winter / 06:00 local in summer, for example.
select cron.schedule(
  'weekly-celebration-digest',
  '0 6 * * 1',
  $$
  select net.http_post(
    url     := 'https://PROJECT_URL/functions/v1/send-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'CRON_SECRET'
    ),
    body    := '{}'::jsonb
  );
  $$
);
