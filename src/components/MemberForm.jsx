// The member form, used by both /signup and the admin dashboard's add/edit
// dialog. `compact` hides the consent box, which only the signup form shows —
// the admin sets consent on the member's behalf from the table.

import { useState } from 'react'
import { DayMonthFields } from './DayMonthFields'

const GENDERS = ['Male', 'Female']
const MEMBERSHIP_CATEGORIES = ['Children', 'Teenager', 'Youth', 'Adult']
const MARITAL_STATUSES = ['Married', 'Single', 'Widowed', 'Divorced', 'Separated']

const BLANK = {
  full_name: '',
  gender: '',
  phone: '',
  email: '',
  residential_address: '',
  membership_category: '',
  marital_status: '',
  occupation: '',
  church_department: '',
  birth_day: null,
  birth_month: null,
  anniversary_day: null,
  anniversary_month: null,
  consent_to_display: false,
}

function toFormValues(member) {
  if (!member) return BLANK
  return {
    full_name: member.full_name ?? '',
    gender: member.gender ?? '',
    phone: member.phone ?? '',
    email: member.email ?? '',
    residential_address: member.residential_address ?? '',
    membership_category: member.membership_category ?? '',
    marital_status: member.marital_status ?? '',
    occupation: member.occupation ?? '',
    church_department: member.church_department ?? '',
    birth_day: member.birth_day ?? null,
    birth_month: member.birth_month ?? null,
    anniversary_day: member.anniversary_day ?? null,
    anniversary_month: member.anniversary_month ?? null,
    consent_to_display: Boolean(member.consent_to_display),
  }
}

function validateForm(values) {
  if (!values.full_name.trim()) return 'Please enter a full name.'
  if (!values.birth_day || !values.birth_month) return 'Please pick a birthday.'

  if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    return 'That email address does not look right.'
  }

  const hasDay = Boolean(values.anniversary_day)
  const hasMonth = Boolean(values.anniversary_month)
  if (hasDay !== hasMonth) return 'An anniversary needs both a day and a month.'

  return null
}

// Empty strings are turned into null so the database stores "not provided"
// rather than a blank string.
const orNull = (v) => v.trim() || null

export default function MemberForm({
  initial = null,
  showConsent = false,
  submitLabel = 'Save',
  busy = false,
  onSubmit,
  onCancel = null,
}) {
  const [values, setValues] = useState(() => toFormValues(initial))
  const [error, setError] = useState(null)

  const set = (key) => (value) => {
    setValues((v) => ({ ...v, [key]: value }))
    setError(null)
  }

  const setBirth = (day, month) => {
    setValues((v) => ({ ...v, birth_day: day, birth_month: month }))
    setError(null)
  }

  const setAnniversary = (day, month) => {
    setValues((v) => ({ ...v, anniversary_day: day, anniversary_month: month }))
    setError(null)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const problem = validateForm(values)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    onSubmit({
      full_name: values.full_name.trim(),
      gender: orNull(values.gender),
      phone: orNull(values.phone),
      email: orNull(values.email),
      residential_address: orNull(values.residential_address),
      membership_category: orNull(values.membership_category),
      marital_status: orNull(values.marital_status),
      occupation: orNull(values.occupation),
      church_department: orNull(values.church_department),
      birth_day: values.birth_day,
      birth_month: values.birth_month,
      anniversary_day: values.anniversary_day,
      anniversary_month: values.anniversary_month,
      consent_to_display: showConsent ? values.consent_to_display : initial?.consent_to_display ?? false,
    })
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="member-name">Full name</label>
        <input
          id="member-name"
          type="text"
          autoComplete="name"
          value={values.full_name}
          onChange={(e) => set('full_name')(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="member-gender">Gender</label>
        <select
          id="member-gender"
          value={values.gender}
          disabled={busy}
          onChange={(e) => set('gender')(e.target.value)}
        >
          <option value="">Not specified</option>
          {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      <div className="field">
        <label htmlFor="member-phone">WhatsApp phone number <span className="optional">(optional)</span></label>
        <input
          id="member-phone"
          type="tel"
          autoComplete="tel"
          value={values.phone}
          onChange={(e) => set('phone')(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="member-email">Email address <span className="optional">(optional)</span></label>
        <input
          id="member-email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(e) => set('email')(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="member-address">Residential address <span className="optional">(optional)</span></label>
        <textarea
          id="member-address"
          rows={2}
          autoComplete="street-address"
          value={values.residential_address}
          onChange={(e) => set('residential_address')(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="member-category">Membership category</label>
        <select
          id="member-category"
          value={values.membership_category}
          disabled={busy}
          onChange={(e) => set('membership_category')(e.target.value)}
        >
          <option value="">Not specified</option>
          {MEMBERSHIP_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <fieldset className="fieldset">
        <legend>Date of birth</legend>
        <DayMonthFields
          idPrefix="birth"
          day={values.birth_day}
          month={values.birth_month}
          onChange={setBirth}
          disabled={busy}
        />
      </fieldset>

      <div className="field">
        <label htmlFor="member-marital">Marital status</label>
        <select
          id="member-marital"
          value={values.marital_status}
          disabled={busy}
          onChange={(e) => set('marital_status')(e.target.value)}
        >
          <option value="">Not specified</option>
          {MARITAL_STATUSES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <fieldset className="fieldset">
        <legend>Wedding anniversary <span className="optional">(optional)</span></legend>
        <DayMonthFields
          idPrefix="anniv"
          day={values.anniversary_day}
          month={values.anniversary_month}
          onChange={setAnniversary}
          disabled={busy}
        />
      </fieldset>

      <div className="field">
        <label htmlFor="member-occupation">Occupation <span className="optional">(optional)</span></label>
        <input
          id="member-occupation"
          type="text"
          value={values.occupation}
          onChange={(e) => set('occupation')(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="member-department">Church department/unit <span className="optional">(optional)</span></label>
        <input
          id="member-department"
          type="text"
          value={values.church_department}
          onChange={(e) => set('church_department')(e.target.value)}
        />
      </div>

      {showConsent && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={values.consent_to_display}
            onChange={(e) => set('consent_to_display')(e.target.checked)}
          />
          <span>I agree my name and birthday may be shown to other church members on this dashboard.</span>
        </label>
      )}

      {error && <p className="form__error" role="alert">{error}</p>}

      <div className="form__actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
