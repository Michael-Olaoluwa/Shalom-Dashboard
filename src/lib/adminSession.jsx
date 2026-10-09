// The admin code lives here, in memory, for the lifetime of the page.
//
// Deliberate trade-off: there is no token and no localStorage copy of the
// code. Refreshing the browser logs the admin out and they retype it. That is
// the right call for a small church tool — nothing to steal from disk, no
// expiry logic to get wrong — and it is expected behaviour, not a bug.

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const AdminSessionContext = createContext(null)

const AUTHED_FLAG = 'admin_authed'

export function AdminSessionProvider({ children }) {
  // The flag below is only a UX nicety so the unlock screen can say "you were
  // signed in, the page was reloaded" instead of looking like a cold start.
  // It grants nothing on its own.
  const [wasSignedIn, setWasSignedIn] = useState(
    () => localStorage.getItem(AUTHED_FLAG) === 'true',
  )
  const [code, setCode] = useState(null)
  const [codeIsCurrent, setCodeIsCurrent] = useState(true)

  const signIn = useCallback((validCode) => {
    setCode(validCode)
    setCodeIsCurrent(true)
    setWasSignedIn(true)
    localStorage.setItem(AUTHED_FLAG, 'true')
  }, [])

  const signOut = useCallback(() => {
    setCode(null)
    localStorage.removeItem(AUTHED_FLAG)
  }, [])

  // Called after a successful code change so later calls use the new code.
  const replaceCode = useCallback((newCode) => {
    setCode(newCode)
    setCodeIsCurrent(true)
  }, [])

  // A 401 mid-session means the code was changed underneath us.
  const markCodeStale = useCallback(() => setCodeIsCurrent(false), [])

  const value = useMemo(
    () => ({
      code,
      isUnlocked: code !== null,
      wasSignedIn,
      codeIsCurrent,
      signIn,
      signOut,
      replaceCode,
      markCodeStale,
    }),
    [code, wasSignedIn, codeIsCurrent, signIn, signOut, replaceCode, markCodeStale],
  )

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>
}

export function useAdminSession() {
  const ctx = useContext(AdminSessionContext)
  if (!ctx) {
    throw new Error('useAdminSession must be used inside AdminSessionProvider')
  }
  return ctx
}
