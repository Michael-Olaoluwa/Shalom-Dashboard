// Public signup. Anyone can call this — it replaces the old Microsoft Form.
//
// There is no code to check here, by design. The consequences are handled by:
//   * strict validation in _shared/validate.ts
//   * a honeypot field below, to catch the simplest bots
//   * rate limiting on this endpoint specifically
//
// Everything read from this payload is treated as untrusted.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handlePreflight, jsonResponse, readJson } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/admin.ts";
import { validateMember } from "../_shared/validate.ts";

const MAX_SUBMISSIONS = 5;
const WINDOW_MINUTES = 60;

// In-memory only, so it resets whenever the function scales down. That is
// acceptable here: the goal is to stop casual spam, not a determined attacker.
// A real quota would need a table, which is not worth it for one church.
const recentSubmissions = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - WINDOW_MINUTES * 60_000;

  const times = (recentSubmissions.get(ip) ?? []).filter((t) => t > cutoff);
  recentSubmissions.set(ip, times);

  if (recentSubmissions.size > 1000) {
    recentSubmissions.clear();
  }

  if (times.length >= MAX_SUBMISSIONS) return true;
  times.push(now);
  return false;
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0]!.trim() : "unknown";

  if (isRateLimited(ip)) {
    return jsonResponse(
      { ok: false, error: "Too many submissions. Please try again later." },
      429,
    );
  }

  const body = await readJson(req);

  // Honeypot: a real person never sees this field, so it is always empty.
  // Answering with a success keeps the bot from learning it was caught.
  if (typeof body.website === "string" && body.website.length > 0) {
    return jsonResponse({ ok: true });
  }

  const parsed = validateMember(body);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: parsed.error }, 400);
  }

  const supabase = serviceClient();
  const { error } = await supabase.from("members").insert(parsed.value);

  if (error) {
    console.error("signup failed", error);
    return jsonResponse(
      { ok: false, error: "Something went wrong. Please try again." },
      500,
    );
  }

  return jsonResponse({ ok: true });
});
