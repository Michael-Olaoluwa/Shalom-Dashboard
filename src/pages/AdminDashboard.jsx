import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
import TopBar from '../components/TopBar'
import SiteFooter from '../components/SiteFooter'

function dateLabel(day, month) {
  if (!day || !month) return '—'
  const d = new Date(2000, month - 1, day)
  return formatShort(d)
}

const iconProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.8',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
  'aria-hidden': 'true',
}

function Overview({ members, onOpen }) {
  return (
    <section className="admin-overview">
      <p className="muted admin-overview__intro">
        {members === null
          ? 'Loading the member list…'
          : members.length === 1
            ? '1 member is on the celebrations list.'
            : `${members.length} members are on the celebrations list.`}
      </p>

      <div className="admin-tiles">
        <button type="button" className="admin-tile" onClick={() => onOpen('members')}>
          <span className="admin-tile__icon" aria-hidden="true">
            <svg {...iconProps}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </span>
          <span className="admin-tile__title">
            Members <span className="count">{members?.length ?? 0}</span>
          </span>
          <span className="admin-tile__desc">
            View the list, edit details, delete, and control who appears on the
            dashboard.
          </span>
        </button>

        <button type="button" className="admin-tile" onClick={() => onOpen('add')}>
          <span className="admin-tile__icon admin-tile__icon--green" aria-hidden="true">
            <svg {...iconProps}>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <span className="admin-tile__title">Add a member</span>
          <span className="admin-tile__desc">
            Register someone new on the celebrations list.
          </span>
        </button>

        <button type="button" className="admin-tile" onClick={() => onOpen('code')}>
          <span className="admin-tile__icon admin-tile__icon--gold" aria-hidden="true">
            <svg {...iconProps}>
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </span>
          <span className="admin-tile__title">Security</span>
          <span className="admin-tile__desc">
            Change the admin code so only the right people get in.
          </span>
        </button>

        <Link to="/" className="admin-tile">
          <span className="admin-tile__icon admin-tile__icon--teal" aria-hidden="true">
            <svg {...iconProps}>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </span>
          <span className="admin-tile__title">Public dashboard</span>
          <span className="admin-tile__desc">
            See exactly what members of the church see.
          </span>
        </Link>
      </div>
    </section>
  )
}

function SectionHead({ title, subtitle, onBack, action }) {
  return (
    <div className="admin-section">
      <div className="admin-section__head">
        <div>
          <h2 className="admin-section__title">{title}</h2>
          {subtitle && <p className="muted small admin-section__sub">{subtitle}</p>}
        </div>
        <div className="admin-section__tools">
          {action}
          <button type="button" className="btn btn--small" onClick={onBack}>
            ← All sections
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const { code, codeIsCurrent, signOut, replaceCode, markCodeStale } = useAdminSession()

  const [view, setView] = useState('overview') // overview | members | add | code
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
        <TopBar backTo="/" backLabel="Home" right={null} />
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
        <SiteFooter />
      </div>
    )
  }

  const flash = (message) => {
    setNotice(message)
    setTimeout(() => setNotice(null), 4000)
  }

  const openView = (next) => {
    setEditing(null)
    setView(next)
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
    openView('members')
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
      <TopBar
        backTo="/"
        backLabel="Home"
        right={
          <span className="topbar__admin">
            Signed in as admin ·{' '}
            <button className="btn btn--small" onClick={signOut}>Sign out</button>
          </span>
        }
      />

      <h1 className="page-title">Admin</h1>

      {notice && <p className="alert alert--ok" role="status">{notice}</p>}
      {loadError && <p className="alert alert--error" role="alert">{loadError}</p>}

      {view === 'overview' && (
        <Overview members={members} onOpen={openView} />
      )}

      {view === 'members' && (
        <>
          <SectionHead
            title="Members"
            subtitle={
              members !== null
                ? `${members.length} ${members.length === 1 ? 'person' : 'people'} on the list`
                : 'Loading the member list…'
            }
            onBack={() => openView('overview')}
            action={
              <button type="button" className="btn btn--small" onClick={() => openView('add')}>
                + Add a member
              </button>
            }
          />

          {editing && (
            <section className="card">
              <h2>Edit {editing.full_name}</h2>
              <MemberForm
                initial={editing}
                submitLabel="Save changes"
                busy={saving}
                onSubmit={handleUpdate}
                onCancel={() => setEditing(null)}
              />
            </section>
          )}

          <section className="card">
            {members === null && <p className="muted">Loading…</p>}

            {members !== null && members.length === 0 && (
              <p className="muted">
                No members yet.{' '}
                <button type="button" className="link-like" onClick={() => openView('add')}>
                  Add the first one.
                </button>
              </p>
            )}

            {members !== null && members.length > 0 && (
              <>
                <p className="muted small">
                  The on/off pill controls whether a member appears on the public
                  dashboard. Birthday and anniversary show the day and month only.
                </p>
                <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
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
              </>
            )}
          </section>
        </>
      )}

      {view === 'add' && (
        <>
          <SectionHead
            title="Add a member"
            subtitle="Details stay private; only the name and celebration dates can appear publicly."
            onBack={() => openView('overview')}
            action={
              <button type="button" className="btn btn--small" onClick={() => openView('members')}>
                View members
              </button>
            }
          />
          <section className="card">
            <MemberForm submitLabel="Add member" busy={saving} onSubmit={handleCreate} />
          </section>
        </>
      )}

      {view === 'code' && (
        <>
          <SectionHead
            title="Security"
            subtitle="Change the admin code. The new code is used from the next sign-in."
            onBack={() => openView('overview')}
          />
          <ChangeCodeSection onChanged={replaceCode} onStale={markCodeStale} />
        </>
      )}

      <SiteFooter />
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