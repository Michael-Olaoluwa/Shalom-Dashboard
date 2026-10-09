import { useEffect, useState } from 'react'

const HIDE_AFTER = 2600
const FADE_MS = 500

// Branded intro shown on every page visit: title centred, the Crymson artwork
// and credit in the footer. It fades to transparent but stays mounted so it
// covers the first paint without blocking the app afterwards.
export default function LoadingScreen() {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setHidden(true), HIDE_AFTER)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      className={`loading-screen${hidden ? ' loading-screen--hide' : ''}`}
      aria-hidden={hidden}
      style={{ '--fade-ms': `${FADE_MS}ms` }}
    >
      <div className="loading-screen__stage">
        <h1 className="loading-screen__title">
          Shalom Parish Celebrations Management Dashboard
        </h1>
        <span className="loading-screen__rule" aria-hidden="true" />
        <span className="loading-screen__spinner" aria-hidden="true" />
      </div>

      <div className="loading-screen__footer">
        <img src="/crymson-art.png" alt="" className="loading-screen__art" />
        <p className="loading-screen__credit">Developed by Crymson Solutions</p>
      </div>
    </div>
  )
}