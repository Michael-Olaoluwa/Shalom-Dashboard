// Changes the shared admin code. Requires the CURRENT code to be re-sent.
//
// The new code is only accepted after the current one has been verified, and
// the caller is rate limited the same way as everywhere else, so nobody can
// brute force their way into taking over the church's member list.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handlePreflight, jsonResponse, readJson } from "../_shared/cors.ts";
import { requireAdmin, serviceClient } from "../_shared/admin.ts";
import { validateNewCode } from "../_shared/validate.ts";

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const supabase = serviceClient();
  const body = await readJson(req);

  const denied = await requireAdmin(req, supabase, body);
  if (denied) return denied;

  const parsed = validateNewCode(body.new_code);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: parsed.error }, 400);
  }

  if (body.new_code === body.code) {
    return jsonResponse(
      { ok: false, error: "The new code must be different from the current one." },
      400,
    );
  }

  const { error } = await supabase
    .from("settings")
    .update({ admin_code: parsed.value.admin_code })
    .eq("id", 1);

  if (error) {
    console.error("change code failed", error);
    return jsonResponse({ ok: false, error: "Could not change the code." }, 500);
  }

  return jsonResponse({ ok: true });
});
