// Deletes a member. Requires the admin code.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handlePreflight, jsonResponse, readJson } from "../_shared/cors.ts";
import { requireAdmin, serviceClient } from "../_shared/admin.ts";

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const supabase = serviceClient();
  const body = await readJson(req);

  const denied = await requireAdmin(req, supabase, body);
  if (denied) return denied;

  if (typeof body.id !== "string" || body.id.length === 0) {
    return jsonResponse({ ok: false, error: "Missing member id." }, 400);
  }

  const { error } = await supabase.from("members").delete().eq("id", body.id);

  if (error) {
    console.error("delete failed", error);
    return jsonResponse({ ok: false, error: "Could not delete this member." }, 500);
  }

  return jsonResponse({ ok: true });
});
