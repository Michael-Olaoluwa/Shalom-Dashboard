import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'

const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/calendar', label: 'Calendar' },
  { to: '/signup', label: 'Join / update' },
]

// Desktop pills + a hamburger menu on small screens, shown on every page.
// `backTo` swaps the brand for a back pill; `right` adds extra actions (e.g. a
// sign-out button) into the nav on both breakpoints.
export default function TopBar({ backTo, backLabel, right }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const location = useLocation()
  const isAdminPage = location.pathname.startsWith('/admin')

  const close = () => setOpen(false)

  // Close on navigation, Escape, or a tap outside the menu.
  useEffect(() => {
    close()
  }, [location.pathname])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) close()
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const NavItems = ({ onNavigate }) => (
    <>
      {NAV_LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}
          onClick={onNavigate}
        >
          {link.label}
        </NavLink>
      ))}
      {!isAdminPage && (
        <NavLink
          to="/admin"
          className={({ isActive }) => `nav-link nav-link--admin${isActive ? ' nav-link--active' : ''}`}
          onClick={onNavigate}
        >
          Are you the admin? <strong>Sign in</strong>
        </NavLink>
      )}
    </>
  )

  return (
    <header className="topbar">
      {backTo ? (
        <Link to={backTo} className="back-link">← {backLabel ?? 'Back'}</Link>
      ) : (
        <span className="topbar__brand">Shalom Celebrations</span>
      )}

      <div className="nav">
        <nav className="nav__desktop" aria-label="Main">
          <NavItems />
          {right}
        </nav>

        <button
          type="button"
          className="nav__toggle"
          aria-expanded={open}
          aria-controls="site-menu"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="nav__toggle-bars" aria-hidden="true" />
          <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
        </button>

        {open && (
          <nav
            id="site-menu"
            className="nav__menu"
            aria-label="Main menu"
            ref={menuRef}
          >
            <NavItems onNavigate={close} />
            {right && <div className="nav__menu-extras">{right}</div>}
          </nav>
        )}
      </div>
    </header>
  )
}