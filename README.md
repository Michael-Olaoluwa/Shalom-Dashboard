# Shalom Celebrations Dashboard

Replaces the church's Microsoft Form + Excel process. Two pages:

- **`/`** — public. Today's date, what's celebrating today, and the next ten
  birthdays and anniversaries. No login.
- **`/admin`** — behind a single shared code. Add, edit, delete members and
  change the code.

No login, no 2FA, no per-person accounts. That's deliberate: whoever runs the
church office is the only person who needs access, and asking a volunteer to
manage accounts is how you end up with everyone sharing one password anyway.

### What's collected

The signup form mirrors the church's original Microsoft Form: full name,
gender, WhatsApp phone number, email address, residential address, membership
category (Children / Teenager / Youth / Adult), date of birth, marital status,
wedding anniversary, occupation and church department/unit. Birth and
anniversary store **day and month only** — no year — so no ages are held.

Of all that, only the name and the two celebration dates can ever reach the
public page. Phone, email and address live in the `members` table and are
readable only through the admin Edge Functions.

---

## How the security model works

This is the part worth reading carefully, because it's the part that's easy to
get wrong in a way that leaks a congregation's phone numbers.

```
Browser  ──select──▶  public_celebrations   (a VIEW: no phone, consented rows only)
   │
   └─────post────▶  Edge Functions  ──service role──▶  members, settings
```

- `members` and `settings` have **RLS enabled with zero policies**. That means
  the `anon` key — which is public, it's in the shipped JavaScript — cannot
  read or write them. Not "shouldn't", *cannot*. Zero policies means every
  operation matches zero rows.
- Only the **service role key** can touch those tables, and it exists solely
  inside the Edge Functions. It is never in frontend code.
- The frontend's **only** direct database call is `select` on the
  `public_celebrations` view, which exposes no phone number and filters to
  `consent_to_display = true`.
- The admin code is **never returned to the browser**, not even on success.
  `check-admin-code` answers `{ ok: true }` and nothing more.

**There is no session token.** Every admin request re-sends the code and the
Edge Function re-checks it. At this scale that's simpler than minting and
revoking tokens, and there's nothing to leak if one leaks. The cost is that
the code sits in memory on the admin's screen and is lost on refresh — see
[Known trade-offs](#known-trade-offs).

### Brute force

A single shared code with no accounts is only as strong as its rate limiting,
so 10 wrong guesses from one IP locks that IP out for 15 minutes, tracked in a
`code_attempts` table. Signup is separately capped at 5 submissions per hour
per IP, and has a honeypot field that catches the simplest bots.

---

## Setup

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. **Project Settings → API Keys**: copy the **Project URL** and the
   **`anon` public** key. (Not the service role key — see step 5.)

   Project URL: `https://yehueudpgogoznmzrwyv.supabase.co`

3. Copy the env file and fill it in:

   ```bash
   cp .env.example .env
   ```

   ```ini
   VITE_SUPABASE_URL=https://yehueudpgogoznmzrwyv.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

4. **SQL Editor → New query**, paste `supabase/schema.sql`, run it. Creates
   the tables, the view, all the RLS, and seeds the admin code as
   `changeme123`.

5. Find the **service role key** (Project Settings → API Keys). Create
   `.env.import` in the project root — a separate file, because Vite would
   embed anything `VITE_`-prefixed into the public bundle:

   ```ini
   SUPABASE_URL=https://yehueudpgogoznmzrwyv.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

   `.env.import` is gitignored. Don't put the service key in `.env`.

### 2. Edge Functions

```bash
npm install -g supabase
supabase login
supabase link --project-ref yehueudpgogoznmzrwyv
```

`supabase init` is already done for you (`supabase/config.toml` and
`supabase/schema.sql` are committed), so skip it — running it now would
overwrite the config.

Deploy all seven:

```bash
supabase functions deploy check-admin-code
supabase functions deploy admin-list-members
supabase functions deploy admin-add-member
supabase functions deploy admin-update-member
supabase functions deploy admin-delete-member
supabase functions deploy admin-change-code
supabase functions deploy public-signup
supabase functions deploy send-digest --no-verify-jwt
```

Then set the secrets:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> **Change the default admin code before handing this to anyone.** `changeme123`
> is in version control history. Sign in at `/admin` and use **Change admin
> code**, or run this once:
>
> ```sql
> update settings set admin_code = 'something-long-and-unpredictable' where id = 1;
> ```

### 3. Run it

```bash
npm install
npm run dev
```

### 4. Import the existing responses

If the church previously used a Microsoft Form, export the responses and import
them directly — **no need to re-ask anyone to fill in a form again**.

In Forms: **Responses → Download responses (Excel)**. Then:

```bash
node scripts/import-members.mjs path/to/responses.xlsx --dry-run
```

`--dry-run` writes nothing and needs no credentials. It prints the column
mapping, the first ten rows it *would* create, and anything it skipped or found
ambiguous. Read that output before going further.

When it looks right:

```bash
node --env-file=.env.import scripts/import-members.mjs path/to/responses.xlsx
```

**Consent is the one thing you must decide.** The old form may not have had a
consent question at all. The script maps a column named like *consent* /
*display* / *agree* if one exists, but if there isn't one, **every imported
member is set to hidden** — they stay off the public page until you switch them
on in `/admin`. That is deliberate: putting ~100 people's names up without
anyone having agreed to it isn't a call an import script should make. Review the
table and tick consent per person, or confirm with the church and bulk-enable.

**Date order.** Numeric dates like `03/14` are ambiguous. The script reads them
as day/month and warns loudly if that produces impossible dates, which is the
usual sign a US-format sheet needs `--date-order=md`. It also understands ISO
timestamps, real Excel date cells, month names, and Excel serial numbers —
Microsoft Forms' own date answers are one of those.

Re-running adds rows again rather than merging. To start over, empty the table
from the Supabase table editor first.

For a handful of rows, the Supabase table editor is faster.

---

## Deployment

Push to GitHub, then connect to Vercel or Netlify. Both auto-detect Vite.

Add these two environment variables in the host's dashboard:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | your project URL |
| `VITE_SUPABASE_ANON_KEY` | your anon public key |

Build command `npm run build`, output directory `dist`. Both are the defaults.

### Weekly email digest

Optional — it removes the need to open the site at all.

1. Sign up at [resend.com](https://resend.com) and verify a sending domain.
2. Set the secrets:

   ```bash
   supabase secrets set \
     RESEND_API_KEY=re_xxx \
     DIGEST_TO=pastor@example.com \
     DIGEST_FROM=church@your-verified-domain.com \
     CRON_SECRET=$(openssl rand -hex 32)
   ```

3. Edit `supabase/schedule.sql`, replacing `PROJECT_URL` and `CRON_SECRET` with
   the same values you just set, then run it in the SQL Editor.

It emails a list of the next 7 days' celebrations every Monday at 06:00 UTC.
Adjust the hour in the cron string for your timezone. Weeks with nothing in
them send no email at all.

To test it without waiting for Monday, run this in the SQL Editor:

```sql
select net.http_post(
  url     := 'https://yehueudpgogoznmzrwyv.supabase.co/functions/v1/send-digest',
  headers := jsonb_build_object('x-cron-secret', 'YOUR_CRON_SECRET'),
  body    := '{}'::jsonb
);
```

---

## Before you hand it to the church

Work through this list. Each one is a real thing that breaks in practice.

- [ ] `/` opens with no code and no login prompt.
- [ ] **Network tab on the public page shows no phone numbers** and no admin
      code in any response. Check the `public_celebrations` response
      specifically — it should contain names and dates only.
- [ ] Signing up **with the consent box unticked still saves the member**, but
      they do *not* appear on `/`. Confirm via the admin table, which shows a
      `Hidden` pill.
- [ ] Ticking consent at signup makes them appear on `/` straight away.
- [ ] Full admin flow: unlock → add a member → they appear on `/` (with
      consent) → edit them → delete them.
- [ ] **Change the admin code**, then confirm the *old* code no longer unlocks
      and the *new* one does. Confirm the session doesn't get kicked out
      immediately after the change.
- [ ] Refreshing `/admin` asks for the code again. This is intended — see
      below, but confirm nobody finds it alarming.
- [ ] Ten wrong codes from one address produce the lockout message.
- [ ] The signup form rejects 31 April and accepts 29 February.
- [ ] The old Microsoft Form is closed and any shared link now points at
      `/signup`.
- [ ] Mobile: the page is readable on a phone. Congregation will check this
      from their sofa, not their desk.

---

## Known trade-offs

**The admin code is lost on refresh.** It's held in memory only, never in
`localStorage`, so there's no copy of the church's admin credential sitting in
a browser's disk cache. The cost is that the admin retypes it if they
accidentally refresh. If that becomes annoying, the fix is a short-lived
signed session token from `check-admin-code` — the code check itself is
already isolated in `supabase/functions/_shared/admin.ts`, so it's a contained
change.

**The signup rate limit is in-memory.** It resets when the function scales
down. That's fine for stopping casual spam at a church, but it is not a real
quota. A real one needs a database table.

**`members` has no unique constraint on name.** A member who submits the form
twice creates two rows. The `/signup` copy says to submit again and have the
admin tidy up, which works at this size. A `unique (full_name)` constraint
would fix it properly, at the cost of rejecting legitimate duplicate names.

**No audit log of admin actions.** A deleted member is gone. For a membership
list this is almost certainly fine, but it is a real gap if the church ever
needs to answer "who removed this person".

**SMS/WhatsApp is deliberately not built.** Email solves the original problem
at no approval-process cost. The swap is noted in a comment at the top of
`supabase/functions/send-digest/index.ts`.

---

## Layout

```
src/
  lib/
    supabaseClient.js   the only place the client is constructed
    api.js              Edge Function wrappers; code passed per call
    dates.js            recurring day/month maths  <- has tests
    adminSession.jsx    in-memory admin code context
  pages/
    PublicDashboard.jsx the public page
    SignupForm.jsx      /signup
    AdminUnlock.jsx     /admin, locked
    AdminDashboard.jsx  /admin, unlocked
  components/
    EventCard.jsx  UpcomingList.jsx  MemberForm.jsx  DayMonthFields.jsx
supabase/
  schema.sql        tables, view, RLS  <- run once
  schedule.sql      the Monday cron job <- run once, after §2 of digest
  config.toml
  functions/
    _shared/        cors, admin-code verification, validation
    check-admin-code/  admin-list-members/  admin-add-member/
    admin-update-member/  admin-delete-member/  admin-change-code/
    public-signup/  send-digest/
scripts/
  import-members.mjs  one-off Excel import
tests/
  dates.test.js    leap years, DST, year rollover
```

`npm test` runs the date tests. They exist because this logic fails silently —
an off-by-one just makes the dashboard quietly wrong on one date a year, and
nobody notices until a member's birthday is missed.
