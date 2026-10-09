import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { checkAdminCode } from '../lib/api'
import { useAdminSession } from '../lib/adminSession'

export default function AdminUnlock() {
  const { signIn, wasSignedIn } = useAdminSession()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!code) {
      setError('Please enter the admin code.')
      return
    }

    setBusy(true)
    setError(null)

    const result = await checkAdminCode(code)
    setBusy(false)

    if (result.ok) {
      // The code is held in memory only. See src/lib/adminSession.jsx.
      signIn(code)
      navigate('/admin', { replace: true })
      return
    }

    setCode('')
    setError(result.error || 'That code is not right.')
  }

  return (
    <div className="page page--narrow">
      <div className="card">
        <h1>Admin</h1>
        <p className="muted">
          Enter the church admin code to manage the member list.
        </p>

        {error && <p className="alert alert--error" role="alert">{error}</p>}

        {wasSignedIn && (
          <p className="alert">
            You were signed in, but reloading the page clears the code for
            safety. Enter it again to continue.
          </p>
        )}

        <form className="form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="admin-code">Admin code</label>
            <input
              id="admin-code"
              type="password"
              autoComplete="off"
              autoFocus
              value={code}
              disabled={busy}
              onChange={(e) => {
                setCode(e.target.value)
                setError(null)
              }}
            />
          </div>

          <div className="form__actions">
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Checking…' : 'Unlock'}
            </button>
          </div>
        </form>

        <p className="muted small">
          The code is never saved to this device, so refreshing the page will
          ask for it again. That's expected.
        </p>
      </div>
    </div>
  )
}
