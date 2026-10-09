// Weekly digest: emails the pastor a list of birthdays and anniversaries
// falling in the next 7 days, so they don't have to open the site.
//
// Triggered by pg_cron (see schedule.sql), which POSTs to this function.
//
// FUTURE UPGRADE — WhatsApp / SMS
// This is deliberately email-only for now. Resend needs no approval process
// and has a generous free tier, which is all this needs to solve the original
// problem. If the church later wants WhatsApp, the swap is contained to
// sendEmail() below: keep the same `buildSections()` output and pass it to a
// WhatsApp Cloud API client instead. Nothing above that function changes.

// --- configuration (set these as Supabase secrets) --------------------------
//   RESEND_API_KEY   - from resend.com
//   DIGEST_TO        - the pastor's email address
//   DIGEST_FROM      - a sender address on your verified Resend domain
//   CRON_SECRET      - a long random string; pg_cron sends it back in a header
//                       so this function cannot be triggered by a stranger.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serviceClient } from "../_shared/admin.ts";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const LOOKAHEAD_DAYS = 7;

type Member = {
  full_name: string;
  birth_day: number | null;
  birth_month: number | null;
  anniversary_day: number | null;
  anniversary_month: number | null;
};

type Entry = {
  name: string;
  kind: "Birthday" | "Anniversary";
  date: Date;
  daysAway: number;
};

/**
 * The next time a given day/month falls on or after `from`.
 * Returns null if that day/month does not exist in the target year, which
 * only happens for 31 Feb-style mistakes (29 Feb is allowed to clamp to
 * 28 Feb in non-leap years, matching the frontend's behaviour).
 */
function nextOccurrence(
  day: number,
  month: number,
  from: Date,
): Date | null {
  for (let offset = 0; offset <= LOOKAHEAD_DAYS; offset++) {
    const candidate = new Date(
      from.getFullYear(),
      from.getMonth(),
      from.getDate() + offset,
    );
    if (candidate.getMonth() + 1 === month) {
      const lastDay = new Date(
        candidate.getFullYear(),
        candidate.getMonth() + 1,
        0,
      ).getDate();
      // 29 Feb on a non-leap year lands on 28 Feb, which is the sane choice
      // for a congregation rather than skipping the year entirely.
      if (day <= lastDay || (month === 2 && day === 29 && lastDay === 28)) {
        return candidate;
      }
    }
  }
  return null;
}

function buildEntries(members: Member[], from: Date): Entry[] {
  const entries: Entry[] = [];

  for (const m of members) {
    if (m.birth_day != null && m.birth_month != null) {
      const date = nextOccurrence(m.birth_day, m.birth_month, from);
      if (date) {
        entries.push({
          name: m.full_name,
          kind: "Birthday",
          date,
          daysAway: Math.round(
            (date.getTime() - from.getTime()) / 86_400_000,
          ),
        });
      }
    }

    if (m.anniversary_day != null && m.anniversary_month != null) {
      const date = nextOccurrence(m.anniversary_day, m.anniversary_month, from);
      if (date) {
        entries.push({
          name: m.full_name,
          kind: "Anniversary",
          date,
          daysAway: Math.round(
            (date.getTime() - from.getTime()) / 86_400_000,
          ),
        });
      }
    }
  }

  return entries.sort((a, b) =>
    a.date.getTime() - b.date.getTime() || a.name.localeCompare(b.name)
  );
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDate(d: Date): string {
  const weekday = d.toLocaleDateString("en-GB", { weekday: "long" });
  return `${weekday} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function relative(daysAway: number): string {
  if (daysAway === 0) return "today";
  if (daysAway === 1) return "tomorrow";
  return `in ${daysAway} days`;
}

/** Renders the digest as plain text + HTML. Kept separate from sending so it
 *  is trivial to swap the transport later. */
function buildSections(entries: Entry[]) {
  const lines = entries.map(
    (e) => `  ${formatDate(e.date)}  (${relative(e.daysAway)})`,
  );

  const byDate = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = formatDate(e.date);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(e);
  }

  const text = [
    "Celebrations in the next 7 days:",
    "",
    ...lines,
    "",
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1a1a1a;line-height:1.5">
      <h2 style="margin:0 0 16px">Celebrations in the next 7 days</h2>
      ${[...byDate.entries()].map(([date, items]) => `
        <div style="margin-bottom:16px">
          <div style="font-weight:600">${date}</div>
          <ul style="margin:4px 0 0;padding-left:20px">
            ${items.map((i) => `<li>${escapeHtml(i.name)} — ${i.kind}</li>`).join("")}
          </ul>
        </div>
      `).join("")}
      <p style="color:#666;font-size:13px;margin-top:24px">
        Sent automatically every Monday by the church celebrations dashboard.
      </p>
    </div>
  `;

  return { text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendEmail(subject: string, text: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("DIGEST_TO");
  const from = Deno.env.get("DIGEST_FROM");

  if (!apiKey || !to || !from) {
    throw new Error(
      "Missing RESEND_API_KEY, DIGEST_TO or DIGEST_FROM secret.",
    );
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
  });

  if (!res.ok) {
    throw new Error(`Resend returned ${res.status}: ${await res.text()}`);
  }

  return await res.json();
}

serve(async (req) => {
  // Called by pg_cron, not by a browser, so there is no CORS to speak of and
  // no admin code — the shared CRON_SECRET header stands in for it.
  const expected = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");

  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ ok: false }), { status: 401 });
  }

  const supabase = serviceClient();
  const { data, error } = await supabase
    .from("members")
    .select("full_name, birth_day, birth_month, anniversary_day, anniversary_month");

  if (error) {
    console.error("digest query failed", error);
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }

  const entries = buildEntries((data ?? []) as Member[], new Date());

  if (entries.length === 0) {
    // Nothing to celebrate this week. Skip the email rather than sending an
    // empty one every Monday.
    return new Response(
      JSON.stringify({ ok: true, sent: 0, note: "nothing in the next 7 days" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const { text, html } = buildSections(entries);
  const subject = `This week: ${entries.length} celebration${
    entries.length === 1 ? "" : "s"
  }`;

  try {
    await sendEmail(subject, text, html);
  } catch (e) {
    console.error("digest send failed", e);
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }

  return new Response(
    JSON.stringify({ ok: true, sent: entries.length }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
