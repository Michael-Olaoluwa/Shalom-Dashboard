import { Link } from 'react-router-dom'

function SignInHint() {
  return (
    <span className="topbar__admin">
      Are you the admin? <Link to="/admin">Sign in</Link>
    </span>
  )
}

// Thin bar above the hero. Home shows the brand; every other page shows a back
// button on the left. `right` overrides the admin hint (e.g. a sign-out button).
export default function TopBar({ backTo, backLabel, right }) {
  return (
    <header className="topbar">
      {backTo ? (
        <span className="topbar__back">
          <Link to={backTo} className="back-link">← {backLabel ?? 'Back'}</Link>
        </span>
      ) : (
        <span className="topbar__brand">Shalom Celebrations</span>
      )}
      {right !== undefined ? right : <SignInHint />}
    </header>
  )
}