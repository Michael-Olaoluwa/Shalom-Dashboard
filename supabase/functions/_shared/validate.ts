// Input validation shared by the member-writing Edge Functions.
//
// The signup endpoint is unauthenticated, so nothing reaches the database
// without passing through here first.

export type MemberInput = {
  full_name: string;
  gender: string | null;
  phone: string | null;
  email: string | null;
  residential_address: string | null;
  membership_category: string | null;
  marital_status: string | null;
  occupation: string | null;
  church_department: string | null;
  birth_day: number;
  birth_month: number;
  anniversary_day: number | null;
  anniversary_month: number | null;
  consent_to_display: boolean;
};

// Mirrors the check constraints in schema.sql and the <select> options on the
// form. Kept here so an invalid value is rejected with a readable message
// instead of bubbling up as a database constraint violation.
export const GENDERS = ["Male", "Female"] as const;
export const MEMBERSHIP_CATEGORIES = [
  "Children",
  "Teenager",
  "Youth",
  "Adult",
] as const;
export const MARITAL_STATUSES = [
  "Married",
  "Single",
  "Widowed",
  "Divorced",
  "Separated",
] as const;

type Result =
  | { ok: true; value: MemberInput }
  | { ok: false; error: string };

function asString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function asDayOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n)) return Number.NaN;
  return n;
}

function asOptionalString(value: unknown, maxLength: number): string | null {
  const s = asString(value, maxLength);
  return s.length > 0 ? s : null;
}

/**
 * Normalises an optional enum field. Blank/missing is fine and becomes null;
 * anything else must match one of the allowed values (case-insensitively), or
 * the caller gets a readable error rather than a database constraint failure.
 */
function asEnumOrNull(
  value: unknown,
  allowed: readonly string[],
  label: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
  const s = asString(value, 40);
  if (s.length === 0) return { ok: true, value: null };

  const match = allowed.find((a) => a.toLowerCase() === s.toLowerCase());
  if (!match) {
    return { ok: false, error: `${label} must be one of: ${allowed.join(", ")}.` };
  }
  return { ok: true, value: match };
}

// Deliberately permissive: enough to catch a typo, not a full RFC 5322 parser.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function daysIn(month: number): number {
  if (month === 2) return 29; // no year is stored, so Feb 29 must be allowed
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

export function validateMember(body: Record<string, unknown>): Result {
  const full_name = asString(body.full_name, 120);
  if (full_name.length === 0) {
    return { ok: false, error: "Full name is required." };
  }

  const gender = asEnumOrNull(body.gender, GENDERS, "Gender");
  if (!gender.ok) return gender;

  const membership_category = asEnumOrNull(
    body.membership_category,
    MEMBERSHIP_CATEGORIES,
    "Membership category",
  );
  if (!membership_category.ok) return membership_category;

  const marital_status = asEnumOrNull(
    body.marital_status,
    MARITAL_STATUSES,
    "Marital status",
  );
  if (!marital_status.ok) return marital_status;

  const email = asOptionalString(body.email, 254);
  if (email !== null && !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "That email address does not look right." };
  }

  const birth_day = asDayOrNull(body.birth_day);
  const birth_month = asDayOrNull(body.birth_month);

  if (birth_day === null || birth_month === null) {
    return { ok: false, error: "Birthday is required." };
  }
  if (birth_month < 1 || birth_month > 12) {
    return { ok: false, error: "Birth month must be between 1 and 12." };
  }
  if (birth_day < 1 || birth_day > daysIn(birth_month)) {
    return {
      ok: false,
      error: "That birthday is not a real date. (No year is stored, so 29 February is allowed.)",
    };
  }

  const anniversary_day = asDayOrNull(body.anniversary_day);
  const anniversary_month = asDayOrNull(body.anniversary_month);

  if (anniversary_day === null && anniversary_month === null) {
    // Anniversary omitted entirely — fine.
  } else if (anniversary_day === null || anniversary_month === null) {
    return {
      ok: false,
      error: "An anniversary needs both a day and a month.",
    };
  } else if (
    anniversary_month < 1 ||
    anniversary_month > 12 ||
    anniversary_day < 1 ||
    anniversary_day > daysIn(anniversary_month)
  ) {
    return { ok: false, error: "That anniversary is not a real date." };
  }

  return {
    ok: true,
    value: {
      full_name,
      gender: gender.value,
      phone: asOptionalString(body.phone, 40),
      email,
      residential_address: asOptionalString(body.residential_address, 300),
      membership_category: membership_category.value,
      marital_status: marital_status.value,
      occupation: asOptionalString(body.occupation, 120),
      church_department: asOptionalString(body.church_department, 120),
      birth_day,
      birth_month,
      anniversary_day: Number.isNaN(anniversary_day) ? null : anniversary_day,
      anniversary_month: Number.isNaN(anniversary_month)
        ? null
        : anniversary_month,
      // Anything other than an explicit true is treated as a no.
      consent_to_display: body.consent_to_display === true,
    },
  };
}

export const MIN_CODE_LENGTH = 8;

export function validateNewCode(value: unknown): Result {
  const code = asString(value, 128);
  if (code.length < MIN_CODE_LENGTH) {
    return {
      ok: false,
      error: `The new code must be at least ${MIN_CODE_LENGTH} characters.`,
    };
  }
  return { ok: true, value: { admin_code: code } };
}
