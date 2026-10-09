import { useCallback, useEffect, useState } from 'react'
import {
  addMember,
  changeAdminCode,
  deleteMember,
  listMembers,
  updateMember,
} from '../lib/api'
import { useAdminSession } from '../lib/adminSession'
import { formatShort } from '../lib/dates'
import MemberForm from '../components/MemberForm'

function dateLabel(day, month) {
  if (!day || !month) return '—'
  const d = new Date(2000, month - 1, day)
  return formatShort(d)
}

export default function AdminDashboard() {
  const { code, codeIsCurrent, signOut, replaceCode, markCodeStale } = useAdminSession()

  const [members, setMembers] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const refresh = useCallback(async () => {
    const result = await listMembers(code)
    if (result.ok) {
      setMembers(result.members)
      setLoadError(null)
      return
    }
    if (result.status === 401) {
      markCodeStale()
      return
    }
    setLoadError(result.error || 'Could not load members.')
    setMembers([])
  }, [code, markCodeStale])

  useEffect(() => {
    refresh()
  }, [refresh])

  // A stale code means someone changed it. The session can no longer act, so
  // send them back to the unlock screen.
  if (!codeIsCurrent) {
    return (
      <div className="page page--narrow">
        <div className="card">
          <h1>Code changed</h1>
          <p className="muted">
            The admin code is no longer the one you entered. Please unlock again
            with the current code.
          </p>
          <button
            className="btn btn--primary"
            onClick={signOut}
          >
            Unlock again
          </button>
        </div>
      </div>
    )
  }

  const flash = (message) => {
    setNotice(message)
    setTimeout(() => setNotice(null), 4000)
  }

  const handleCreate = async (values) => {
    setSaving(true)
    const result = await addMember(code, values)
    setSaving(false)

    if (!result.ok) {
      if (result.status === 401) return markCodeStale()
      flash(result.error || 'Could not add that member.')
      return
    }
    flash(`Added ${values.full_name}.`)
    await refresh()
  }

  const handleUpdate = async (values) => {
    setSaving(true)
    const result = await updateMember(code, { id: editing.id, ...values })
    setSaving(false)

    if (!result.ok) {
      if (result.status === 401) return markCodeStale()
      flash(result.error || 'Could not save those changes.')
      return
    }
    flash(`Updated ${values.full_name}.`)
    setEditing(null)
    await refresh()
  }

  // Consent is the switch that decides whether someone appears on the public
  // page, so it needs to be flippable without a full edit-and-save.
  const handleToggleConsent = async (member) => {
    setBusyId(member.id)
    const result = await updateMember(code, {
      id: member.id,
      full_name: member.full_name,
      gender: member.gender,
      phone: member.phone,
      email: member.email,
      residential_address: member.residential_address,
      membership_category: member.membership_category,
      marital_status: member.marital_status,
      occupation: member.occupation,
      church_department: member.church_department,
      birth_day: member.birth_day,
      birth_month: member.birth_month,
      anniversary_day: member.anniversary_day,
      anniversary_month: member.anniversary_month,
      consent_to_display: !member.consent_to_display,
    })
    setBusyId(null)

    if (!result.ok) {
      if (result.status === 401) return markCodeStale()
      return flash(result.error || 'Could not update consent.')
    }
    await refresh()
  }

  const handleDelete = async (member) => {
    if (!window.confirm(`Remove ${member.full_name} from the list?`)) return

    setBusyId(member.id)
    const result = await deleteMember(code, member.id)
    setBusyId(null)

    if (!result.ok) {
      if (result.status === 401) return markCodeStale()
      flash(result.error || 'Could not delete that member.')
      return
    }
    flash(`Removed ${member.full_name}.`)
    await refresh()
  }

  return (
    <div className="page">
      <header className="admin-header">
        <h1>Admin</h1>
        <button className="btn" onClick={signOut}>Sign out</button>
      </header>

      {notice && <p className="alert alert--ok" role="status">{notice}</p>}
      {loadError && <p className="alert alert--error" role="alert">{loadError}</p>}

      <section className="card">
        <h2>{editing ? `Edit ${editing.full_name}` : 'Add a member'}</h2>

        {editing ? (
          <MemberForm
            initial={editing}
            submitLabel="Save changes"
            busy={saving}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <MemberForm submitLabel="Add member" busy={saving} onSubmit={handleCreate} />
        )}

        <p className="muted small">
          Consent is managed from the table below, so members can be listed
          here and opted in separately.
        </p>
      </section>

      <section className="card">
        <h2>Members <span className="count">{members?.length ?? 0}</span></h2>

        {members === null && <p className="muted">Loading…</p>}

        {members !== null && members.length === 0 && (
          <p className="muted">No members yet. Add the first one above.</p>
        )}

        {members !== null && members.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Gender</th>
                  <th>WhatsApp</th>
                  <th>Email</th>
                  <th>Address</th>
                  <th>Category</th>
                  <th>Marital status</th>
                  <th>Occupation</th>
                  <th>Department</th>
                  <th>Birthday</th>
                  <th>Anniversary</th>
                  <th>On dashboard</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>{m.full_name}</td>
                    <td>{m.gender || <span className="muted">—</span>}</td>
                    <td>{m.phone || <span className="muted">—</span>}</td>
                    <td>{m.email || <span className="muted">—</span>}</td>
                    <td className="table__address">{m.residential_address || <span className="muted">—</span>}</td>
                    <td>{m.membership_category || <span className="muted">—</span>}</td>
                    <td>{m.marital_status || <span className="muted">—</span>}</td>
                    <td>{m.occupation || <span className="muted">—</span>}</td>
                    <td>{m.church_department || <span className="muted">—</span>}</td>
                    <td>{dateLabel(m.birth_day, m.birth_month)}</td>
                    <td>{dateLabel(m.anniversary_day, m.anniversary_month)}</td>
                    <td>
                      <button
                        className={`pill pill--toggle ${m.consent_to_display ? 'pill--on' : 'pill--off'}`}
                        onClick={() => handleToggleConsent(m)}
                        disabled={busyId === m.id}
                        title={m.consent_to_display
                          ? 'Showing on the public page. Click to hide.'
                          : 'Hidden from the public page. Click to show.'}
                        style={{ border: 'none', cursor: 'pointer' }}
                      >
                        {m.consent_to_display ? 'Shown' : 'Hidden'}
                      </button>
                    </td>
                    <td className="table__actions">
                      <button
                        className="btn btn--small"
                        onClick={() => setEditing(m)}
                        disabled={busyId === m.id}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn--small btn--danger"
                        onClick={() => handleDelete(m)}
                        disabled={busyId === m.id}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ChangeCodeSection onChanged={replaceCode} onStale={markCodeStale} />
    </div>
  )
}

function ChangeCodeSection({ onChanged, onStale }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (next.length < 8) {
      setError('The new code must be at least 8 characters.')
      return
    }
    if (next !== confirm) {
      setError('The new code and its confirmation do not match.')
      return
    }
    if (next === current) {
      setError('The new code must be different from the current one.')
      return
    }

    setBusy(true)
    setError(null)

    const result = await changeAdminCode(current, next)
    setBusy(false)

    if (!result.ok) {
      if (result.status === 401) return onStale()
      setError(result.error || 'Could not change the code.')
      return
    }

    // The code in memory is now stale; swap it for the new one so the rest of
    // this session keeps working.
    onChanged(next)
    setCurrent('')
    setNext('')
    setConfirm('')
    setDone(true)
    setError(null)
  }

  return (
    <section className="card">
      <h2>Change admin code</h2>

      {done && (
        <p className="alert alert--ok" role="status">
          Code changed. It's already updated for this session — you don't need
          to sign in again.
        </p>
      )}

      {error && <p className="alert alert--error" role="alert">{error}</p>}

      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="current-code">Current code</label>
          <input
            id="current-code"
            type="password"
            autoComplete="off"
            value={current}
            disabled={busy}
            onChange={(e) => { setCurrent(e.target.value); setError(null) }}
          />
        </div>

        <div className="field">
          <label htmlFor="new-code">New code <span className="optional">(8+ characters)</span></label>
          <input
            id="new-code"
            type="password"
            autoComplete="off"
            value={next}
            disabled={busy}
            onChange={(e) => { setNext(e.target.value); setError(null) }}
          />
        </div>

        <div className="field">
          <label htmlFor="confirm-code">Confirm new code</label>
          <input
            id="confirm-code"
            type="password"
            autoComplete="off"
            value={confirm}
            disabled={busy}
            onChange={(e) => { setConfirm(e.target.value); setError(null) }}
          />
        </div>

        <div className="form__actions">
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Change code'}
          </button>
        </div>
      </form>
    </section>
  )
}
