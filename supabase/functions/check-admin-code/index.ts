// Verifies the admin code so the UI can tell a right code from a wrong one.
//
// Note: this function does NOT mint a session token. Every admin function
// re-sends the code and re-checks it, so this endpoint is purely a UX
// convenience — it saves the admin from filling in a form that would fail.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handlePreflight, jsonResponse, readJson } from "../_shared/cors.ts";
import { requireAdmin, serviceClient } from "../_shared/admin.ts";

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const supabase = serviceClient();
  const body = await readJson(req);

  // requireAdmin handles rate limiting, code comparison and attempt logging,
  // and returns a 401/429 response when the caller is not authorised.
  const denied = await requireAdmin(req, supabase, body);
  if (denied) return denied;

  return jsonResponse({ ok: true });
});
