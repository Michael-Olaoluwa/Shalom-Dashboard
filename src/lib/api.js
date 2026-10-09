// Thin wrapper around the admin Edge Functions.
//
// Two rules this file exists to enforce:
//   1. The admin code is passed in on every call and never stored anywhere.
//   2. Nothing in here ever touches the `members` or `settings` tables
//      directly — that is only reachable from inside Edge Functions.

import { supabase } from './supabaseClient'

/**
 * Calls an Edge Function and normalises its response.
 * Edge Functions return `{ ok: true }` or `{ ok: false, error }`, and
 * supabase-js surfaces a non-2xx as a thrown FunctionsHttpError, so both
 * paths are folded into one result object here.
 */
async function callFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })

  if (error) {
    // A non-2xx response still carries a useful JSON body worth surfacing.
    const context = await error.context?.json?.().catch(() => null)
    const status = error.status ?? error.context?.status ?? 0

    // No HTTP status at all means the request never got a response: the
    // function isn't deployed, the URL is wrong, or the browser blocked it.
    // That is an infrastructure problem, not a bad code — say so, because
    // "Failed to send a request" gives the admin nothing to act on.
    if (status === 0) {
      console.error(`[${name}] no response from the Edge Function:`, error)
      return {
        ok: false,
        status: 0,
        error:
          `Could not reach the "${name}" function. It may not be deployed yet.`,
      }
    }

    return {
      ok: false,
      status,
      error: context?.error || error.message || 'Something went wrong.',
    }
  }

  if (!data) {
    return { ok: false, error: 'No response from the server.', status: 0 }
  }

  return data
}

export const checkAdminCode = (code) => callFunction('check-admin-code', { code })

export const listMembers = (code) => callFunction('admin-list-members', { code })

export const addMember = (code, member) =>
  callFunction('admin-add-member', { code, ...member })

export const updateMember = (code, member) =>
  callFunction('admin-update-member', { code, ...member })

export const deleteMember = (code, id) =>
  callFunction('admin-delete-member', { code, id })

export const changeAdminCode = (code, newCode) =>
  callFunction('admin-change-code', { code, new_code: newCode })

export const submitSignup = (member) => callFunction('public-signup', member)
