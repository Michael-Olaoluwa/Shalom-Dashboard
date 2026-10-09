// The whole year at a glance: every birthday and anniversary grouped by month,
// with year navigation. Reads only the `public_celebrations` view, so it can
// show names + dates of consented members and nothing else.

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { buildCelebrationsForYear, groupByMonth } from '../lib/dates'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function MonthCard({ monthIndex, entries, today, year }) {
  const currentMonth = today.getFullYear() === year && today.getMonth() === monthIndex

  return (
    <section className={`month-card${currentMonth ? ' month-card--current' : ''}`}>
      <h3 className="month-card__title">
        {MONTHS[monthIndex]} <span className="count">{entries.length}</span>
      </h3>

      {entries.length === 0 ? (
        <p className="panel__empty">No celebrations</p>
      ) : (
        <ul className="cal">
          {entries.map((e) => {
            const isToday = currentMonth && e.date.getDate() === today.getDate()
            return (
              <li
                key={`${e.kind}-${e.id}`}
                className={`cal__row${isToday ? ' cal__row--today' : ''}`}
              >
                <span className="cal__day">{e.date.getDate()}</span>
                <span className="cal__name">{e.name}</span>
                <span className={`tag tag--${e.kind}`}>
                  {e.kind === 'birthday' ? 'Birthday' : 'Anniversary'}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default function YearCalendar() {
  const [people, setPeople] = useState(null)
  const [error, setError] = useState(null)
  const [today] = useState(() => new Date())
  const [year, setYear] = useState(() => today.getFullYear())

  useEffect(() => {
    let cancelled = false

    supabase
      .from('public_celebrations')
      .select('id, full_name, birth_day, birth_month, anniversary_day, anniversary_month')
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          console.error('[public_celebrations] query failed:', err)
          setError("We couldn't load the celebrations right now. Please try again shortly.")
          setPeople([])
          return
        }
        setPeople(data ?? [])
      })

    return () => {
      cancelled = true
    }
  }, [])

  const months = useMemo(() => {
    if (!people) return null
    const birthdays = buildCelebrationsForYear(people, 'birthday', year)
    const anniversaries = buildCelebrationsForYear(people, 'anniversary', year)
    return groupByMonth([...birthdays, ...anniversaries])
  }, [people, year])

  return (
    <div className="page">
      <Link to="/" className="corner-link">Home</Link>

      <header className="hero hero--compact">
        <h1 className="hero__date">Celebrations calendar</h1>
        <p className="hero__sub">Every birthday and anniversary, by month</p>
      </header>

      <div className="cal-nav">
        <button className="btn btn--small" onClick={() => setYear((y) => y - 1)}>
          ← {year - 1}
        </button>
        <span className="cal-nav__year" aria-live="polite">{year}</span>
        {year !== today.getFullYear() && (
          <button className="btn btn--small" onClick={() => setYear(today.getFullYear())}>
            Jump to today
          </button>
        )}
        <button className="btn btn--small" onClick={() => setYear((y) => y + 1)}>
          {year + 1} →
        </button>
      </div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}

      {months === null && <p className="loading">Loading…</p>}

      {months !== null && (
        <>
          <div className="calendar-grid">
            {months.map((entries, i) => (
              <MonthCard
                key={MONTHS[i]}
                monthIndex={i}
                entries={entries}
                today={today}
                year={year}
              />
            ))}
          </div>

          {people.length === 0 && (
            <div className="empty-cta" style={{ marginTop: '1.5rem' }}>
              Nobody is listed on the dashboard yet.{' '}
              <Link to="/signup">Add your details here.</Link>
            </div>
          )}

          <footer className="page__footer">
            <Link to="/signup" className="footer-cta">
              Join / update your info
            </Link>
          </footer>
        </>
      )}
    </div>
  )
}