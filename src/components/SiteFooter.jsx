import { Link } from 'react-router-dom'

const CONTACTS = [
  {
    label: 'WhatsApp',
    value: '09045127201',
    href: 'https://wa.me/2349045127201',
  },
  {
    label: 'Email',
    value: 'ola.michael.190606@gmail.com',
    href: 'mailto:ola.michael.190606@gmail.com',
  },
  {
    label: 'LinkedIn',
    value: 'Michael Olaoluwa',
    href: 'https://www.linkedin.com/search/results/people/?keywords=Michael%20Olaoluwa',
  },
  {
    label: 'Instagram',
    value: 'jr_dev_mike',
    href: 'https://www.instagram.com/jr_dev_mike/',
  },
]

// Branded footer shown at the bottom of every page. `cta` optionally shows a
// highlighted action (e.g. the public pages invite people to join the list).
export default function SiteFooter({ cta }) {
  return (
    <footer className="site-footer">
      {cta && (
        <Link to={cta.to} className="site-footer__cta">{cta.label}</Link>
      )}

      <div className="site-footer__brand">
        <img src="/crymson-art.png" alt="" className="site-footer__logo" />
        <p className="site-footer__credit">
          Developed by <strong>Crymson Solutions</strong>
        </p>
      </div>

      <p className="site-footer__tagline">
        Want something like this? Please contact us at:
      </p>

      <ul className="site-footer__contacts">
        {CONTACTS.map((c, i) => (
          <li key={c.label}>
            {c.label}:{' '}
            <a
              href={c.href}
              target={c.href.startsWith('mailto') ? undefined : '_blank'}
              rel="noopener noreferrer"
            >
              {c.value}
            </a>
            {i < CONTACTS.length - 1 ? ',' : '.'}
          </li>
        ))}
      </ul>
    </footer>
  )
}