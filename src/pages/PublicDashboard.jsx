import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { buildCelebrations, formatToday, partition } from '../lib/dates'
import EventCard from '../components/EventCard'
import UpcomingList, { NoMembersYet } from '../components/UpcomingList'
import TopBar from '../components/TopBar'
import SiteFooter from '../components/SiteFooter'

// The ONLY direct table access in the whole app. `public_celebrations` has no
// phone column and no non-consented rows, so this is safe to run as `anon`.
export default function PublicDashboard() {
  const [people, setPeople] = useState(null)
  const [error, setError] = useState(null)
  // Captured once per mount. Reading the clock during render would make the
  // output depend on when React happened to re-render.
  const [today] = useState(() => new Date())

  useEffect(() => {
    let cancelled = false

    supabase
      .from('public_celebrations')
      .select('id, full_name, birth_day, birth_month, anniversary_day, anniversary_month')
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          // The visitor only needs the friendly line; the real reason (usually
          // "the schema has not been run yet") goes to the console so it can be
          // diagnosed instead of guessed at.
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

  const { birthdays, anniversaries } = useMemo(() => {
    if (!people) return { birthdays: null, anniversaries: null }
    return {
      birthdays: partition(buildCelebrations(people, 'birthday', today)),
      anniversaries: partition(buildCelebrations(people, 'anniversary', today)),
    }
  }, [people, today])

  const todayEntries = birthdays && anniversaries
    ? [...birthdays.today, ...anniversaries.today]
    : []

  return (
    <div className="page">
      <TopBar />

      <header className="hero">
        <p className="hero__eyebrow">Celebrations at Shalom</p>
        <h1 className="hero__date">{formatToday(today)}</h1>
        <p className="hero__sub">
          {todayEntries.length > 0
            ? `${todayEntries.length} celebration${todayEntries.length === 1 ? '' : 's'} to rejoice in today`
            : 'A day to celebrate family, fellowship and faith'}
        </p>
        <span className="hero__orb hero__orb--one" aria-hidden="true" />
        <span className="hero__orb hero__orb--two" aria-hidden="true" />
      </header>

      <p className="year-link">
        <Link to="/calendar">See all celebrations this year →</Link>
      </p>

      {error && <p className="alert alert--error" role="alert">{error}</p>}

      {people === null && !error && <p className="loading">Loading…</p>}

      {people !== null && (
        <>
          {todayEntries.length > 0 ? (
            <section className="section">
              <h2 className="section__title">Today</h2>
              <div className="event-grid">
                {todayEntries.map((e) => (
                  <EventCard key={`${e.kind}-${e.id}`} event={e} isToday />
                ))}
              </div>
            </section>
          ) : (
            <section className="section">
              <h2 className="section__title">Today</h2>
              <p className="section__empty">Nothing today. Enjoy the quiet.</p>
            </section>
          )}

          {people.length === 0 ? (
            <NoMembersYet />
          ) : (
            <div className="columns">
              <UpcomingList
                title="Upcoming birthdays"
                events={birthdays.upcoming}
                emptyText="No birthdays in the next few weeks."
              />
              <UpcomingList
                title="Upcoming anniversaries"
                events={anniversaries.upcoming}
                emptyText="No anniversaries in the next few weeks."
                tone="anniversary"
              />
            </div>
          )}
        </>
      )}

      <SiteFooter cta={{ to: '/signup', label: 'Join / update your info' }} />
    </div>
  )
}
