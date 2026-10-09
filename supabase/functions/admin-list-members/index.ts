// Returns every member, including phone numbers and non-consented rows.
// Gated by the admin code. The public page never calls this — it reads the
// `public_celebrations` view instead.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handlePreflight, jsonResponse, readJson } from "../_shared/cors.ts";
import { requireAdmin, serviceClient } from "../_shared/admin.ts";

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const supabase = serviceClient();
  const denied = await requireAdmin(req, supabase, await readJson(req));
  if (denied) return denied;

  const { data, error } = await supabase
    .from("members")
    .select("id, full_name, gender, phone, email, residential_address, membership_category, marital_status, occupation, church_department, birth_day, birth_month, anniversary_day, anniversary_month, consent_to_display, created_at")
    .order("full_name", { ascending: true });

  if (error) {
    console.error("list failed", error);
    return jsonResponse({ ok: false, error: "Could not load members." }, 500);
  }

  return jsonResponse({ ok: true, members: data ?? [] });
});
