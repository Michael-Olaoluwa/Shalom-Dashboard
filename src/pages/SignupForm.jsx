import { useState } from 'react'
import { Link } from 'react-router-dom'
import { submitSignup } from '../lib/api'
import MemberForm from '../components/MemberForm'
import TopBar from '../components/TopBar'
import SiteFooter from '../components/SiteFooter'

export default function SignupForm() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  const handleSubmit = async (member) => {
    setBusy(true)
    setError(null)

    // The honeypot field: bots fill in everything they see, people never see
    // it. The Edge Function silently accepts and discards these.
    const result = await submitSignup({ ...member, website: '' })

    setBusy(false)

    if (result.ok) {
      setDone(true)
      return
    }
    setError(result.error || 'Something went wrong. Please try again.')
  }

  if (done) {
    return (
      <div className="page page--narrow">
        <TopBar backTo="/" backLabel="Home" />
        <div className="card">
          <h1>Thank you</h1>
          <p>Your details have been saved.</p>
          <p className="muted">
            You'll appear on the dashboard for your birthday and anniversary if
            you ticked the consent box. If you didn't, the church admin can
            switch that on for you.
          </p>
          <Link to="/" className="btn btn--primary">Back to celebrations</Link>
        </div>
        <SiteFooter />
      </div>
    )
  }

  return (
    <div className="page page--narrow">
      <TopBar backTo="/" backLabel="Home" />
      <div className="card">
        <h1>Join / update your info</h1>
        <p className="muted">
          We keep your name, gender, WhatsApp number, email and address, your
          membership category and marital status, and the day and month of your
          birthday and anniversary. No year is stored. Only your name and
          celebration dates are ever shown on the dashboard, and only if you
          tick the consent box below.
        </p>

        {error && <p className="alert alert--error" role="alert">{error}</p>}

        <MemberForm
          showConsent
          submitLabel="Submit"
          busy={busy}
          onSubmit={handleSubmit}
        />

        <p className="muted small">
          Already listed and need to change something? Submit again with the
          same name and the church admin will tidy it up.
        </p>
      </div>
      <SiteFooter />
    </div>
  )
}
