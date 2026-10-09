// Admin code verification + brute-force throttling.
//
// Design decision: there is no session token. Every admin call re-sends the
// code and we re-check it. At this scale that is simpler and safer than
// minting tokens, because there is nothing to invalidate or leak.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonResponse } from "./cors.ts";

// Service role key bypasses RLS. It must never leave the Edge Runtime.
export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export type ServiceClient = ReturnType<typeof serviceClient>;

// 10 wrong guesses from one IP locks that IP out for 15 minutes.
const MAX_FAILED_ATTEMPTS = 10;
const WINDOW_MINUTES = 15;
const CLEANUP_AFTER_HOURS = 24;

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function isRateLimited(
  supabase: ServiceClient,
  ip: string,
): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();

  const { count, error } = await supabase
    .from("code_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("ok", false)
    .gt("created_at", since);

  if (error) {
    // Fail closed: if we cannot read the attempt log we cannot prove the
    // caller is under the limit.
    console.error("rate limit check failed", error);
    return true;
  }

  return (count ?? 0) >= MAX_FAILED_ATTEMPTS;
}

export async function recordAttempt(
  supabase: ServiceClient,
  ip: string,
  ok: boolean,
): Promise<void> {
  await supabase.from("code_attempts").insert({ ip, ok });

  // Opportunistic cleanup, so the table stays small without a cron job.
  const cutoff = new Date(
    Date.now() - CLEANUP_AFTER_HOURS * 3_600_000,
  ).toISOString();
  await supabase
    .from("code_attempts")
    .delete()
    .lt("created_at", cutoff);
}

// Constant-time comparison via SHA-256 digests, so the response time does not
// leak how many characters of the code were correct.
async function digest(value: string): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return new Uint8Array(hash);
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function codeMatches(
  supabase: ServiceClient,
  candidate: unknown,
): Promise<boolean> {
  if (typeof candidate !== "string" || candidate.length === 0) return false;

  const { data, error } = await supabase
    .from("settings")
    .select("admin_code")
    .eq("id", 1)
    .single();

  if (error || !data) {
    console.error("could not read settings", error);
    return false;
  }

  return equalBytes(await digest(candidate), await digest(data.admin_code));
}

/**
 * Standard preamble for every admin function.
 * Returns null when the request is authorised and should be processed.
 * Returns a ready-to-return Response when it is not.
 */
export async function requireAdmin(
  req: Request,
  supabase: ServiceClient,
  body: Record<string, unknown>,
): Promise<Response | null> {
  const ip = clientIp(req);

  if (await isRateLimited(supabase, ip)) {
    return jsonResponse(
      { ok: false, error: "Too many failed attempts. Try again in 15 minutes." },
      429,
    );
  }

  const ok = await codeMatches(supabase, body.code);
  await recordAttempt(supabase, ip, ok);

  if (!ok) {
    return jsonResponse({ ok: false, error: "Incorrect admin code." }, 401);
  }

  return null;
}
