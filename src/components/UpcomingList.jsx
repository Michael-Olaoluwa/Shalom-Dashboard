import { Link } from 'react-router-dom'
import { formatShort, relativeDays } from '../lib/dates'

/**
 * "Upcoming birthdays" / "Upcoming anniversaries" list.
 * Entries already shown in the Today section are not repeated here.
 */
export default function UpcomingList({ title, events, emptyText }) {
  return (
    <section className="panel">
      <h2 className="panel__title">{title}</h2>

      {events.length === 0 ? (
        <p className="panel__empty">{emptyText}</p>
      ) : (
        <ul className="upcoming">
          {events.map((event) => (
            <li key={`${event.kind}-${event.id}`} className="upcoming__row">
              <div className="upcoming__who">
                <span className="upcoming__name">{event.name}</span>
              </div>
              <span className="upcoming__date">{formatShort(event.date)}</span>
              <span className="upcoming__rel">{relativeDays(event.daysAway)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// Re-exported so the public page can point its empty state at the signup form.
export function NoMembersYet() {
  return (
    <p className="empty-cta">
      Nobody has signed up yet.{' '}
      <Link to="/signup">Add your details here</Link>.
    </p>
  )
}
