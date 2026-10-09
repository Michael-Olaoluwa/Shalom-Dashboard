import { formatOccurrence, relativeDays } from '../lib/dates'

const LABELS = {
  birthday: 'Birthday',
  anniversary: 'Anniversary',
}

/**
 * One celebration, used on the public page. `isToday` gets a highlight
 * treatment because that's the one people actually look for.
 */
export default function EventCard({ event, isToday = false }) {
  return (
    <article className={`event-card${isToday ? ' event-card--today' : ''}`}>
      <div className="event-card__head">
        <h3 className="event-card__name">{event.name}</h3>
        <span className={`tag tag--${event.kind}`}>{LABELS[event.kind]}</span>
      </div>
      <p className="event-card__when">{formatOccurrence(event.date)}</p>
      <p className="event-card__rel">{relativeDays(event.daysAway)}</p>
    </article>
  )
}
