// Updates a member. Requires the admin code.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handlePreflight, jsonResponse, readJson } from "../_shared/cors.ts";
import { requireAdmin, serviceClient } from "../_shared/admin.ts";
import { validateMember } from "../_shared/validate.ts";

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

  const parsed = validateMember(body);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: parsed.error }, 400);
  }

  const { error } = await supabase
    .from("members")
    .update(parsed.value)
    .eq("id", body.id);

  if (error) {
    console.error("update failed", error);
    return jsonResponse({ ok: false, error: "Could not update this member." }, 500);
  }

  return jsonResponse({ ok: true });
});
