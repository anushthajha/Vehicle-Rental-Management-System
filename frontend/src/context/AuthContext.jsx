/**
 * Auth Architecture (tab-isolated):
 *
 * - Access token  → Zustand memory only (lost on refresh, recovered via cookie)
 * - Refresh token → HttpOnly cookie set by backend (never readable by JS)
 * - User object   → sessionStorage (tab-isolated, survives F5 within same tab)
 *
 * This means two tabs can be logged in as two different users simultaneously.
 * Logging out in one tab does NOT affect the other tab.
 */

import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { create } from 'zustand'
import api from '../services/api'

const SESSION_USER_KEY = 'sigfleet_user'   // sessionStorage — tab-isolated
const DAILY_BRIEF_PREFIX = 'daily_brief_shown:'
const AUTO_RESTORE_AUTH = import.meta.env.VITE_AUTO_RESTORE_AUTH === 'true'

function clearDailyBriefSessionFlags() {
  Object.keys(sessionStorage)
    .filter((key) => key.startsWith(DAILY_BRIEF_PREFIX))
    .forEach((key) => sessionStorage.removeItem(key))
}

function clearStoredSession() {
  sessionStorage.removeItem(SESSION_USER_KEY)
  clearDailyBriefSessionFlags()
}

// ─── Zustand store ────────────────────────────────────────────────────────────
export const useAuthStore = create((set, get) => ({
  user: null,
  accessToken: null,   // memory only — never written to any storage
  isLoading: true,

  setUser: (user) => {
    // Persist user object to sessionStorage so F5 doesn't lose the name/role
    if (user) sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user))
    else sessionStorage.removeItem(SESSION_USER_KEY)
    set({ user })
  },

  setAccessToken: (accessToken) => {
    set({ accessToken })
  },

  // Called on mount — restore user from sessionStorage if present
  hydrateFromStorage: () => {
    const raw = sessionStorage.getItem(SESSION_USER_KEY)
    if (raw) {
      try {
        const user = JSON.parse(raw)
        set({ user })
      } catch {
        sessionStorage.removeItem(SESSION_USER_KEY)
      }
    }
    // isLoading stays true until /auth/me confirms the token is still valid
  },

  logout: () => {
    const token = get().accessToken
    // Clear state and sessionStorage immediately
    clearStoredSession()
    set({ user: null, accessToken: null, isLoading: false })
    // Tell backend to clear the HttpOnly cookie + blacklist the access token
    if (token) {
      api.post('/auth/logout', {}, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    } else {
      // Even without an access token, hit logout to clear the cookie
      api.post('/auth/logout', {}).catch(() => {})
    }
  },

  setLoading: (isLoading) => set({ isLoading }),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────
const AuthContext = createContext(null)

function decodeJwt(token) {
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const authState = useAuthStore()
  const { accessToken, setAccessToken, setUser, logout, hydrateFromStorage, setLoading } = authState

  // Step 1: Restore the current tab's user if present.
  // Fresh tabs do not auto-login from only the old HttpOnly cookie unless enabled.
  useEffect(() => {
    const hasTabSession = Boolean(sessionStorage.getItem(SESSION_USER_KEY))
    if (AUTO_RESTORE_AUTH || hasTabSession) {
      hydrateFromStorage()
    }
  }, [hydrateFromStorage])

  // Step 2: Axios interceptors — attach access token + handle 401 refresh
  useEffect(() => {
    const requestInterceptor = api.interceptors.request.use((config) => {
      const token = useAuthStore.getState().accessToken
      if (token) config.headers.Authorization = `Bearer ${token}`
      return config
    })

    const responseInterceptor = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const original = error.config
        if (
          error.response?.status === 401 &&
          !original?._retry &&
          !original?.url?.includes('/auth/refresh') &&
          !original?.url?.includes('/auth/logout')
        ) {
          original._retry = true
          try {
            // Cookie is sent automatically — no body needed
            const response = await api.post('/auth/refresh', {})
            const newAccessToken = response.data?.access_token
            if (newAccessToken) {
              setAccessToken(newAccessToken)
              original.headers = original.headers || {}
              original.headers.Authorization = `Bearer ${newAccessToken}`
              return api(original)
            }
          } catch {
            logout()
            navigate('/auth/login', { replace: true })
          }
        }
        return Promise.reject(error)
      },
    )

    return () => {
      api.interceptors.request.eject(requestInterceptor)
      api.interceptors.response.eject(responseInterceptor)
    }
  }, [logout, navigate, setAccessToken])

  // Step 3: Refresh auth only for an active tab session, or when explicitly enabled.
  // This keeps F5 refresh logged in without reviving old cookie-only sessions.
  const rehydratedRef = useRef(false)

  useEffect(() => {
    if (rehydratedRef.current) return
    rehydratedRef.current = true

    const hasTabSession = Boolean(sessionStorage.getItem(SESSION_USER_KEY))
    if (!AUTO_RESTORE_AUTH && !hasTabSession) {
      useAuthStore.setState({ user: null, accessToken: null })
      setLoading(false)
      return undefined
    }

    async function rehydrate() {
      try {
        // Try to get a new access token using the HttpOnly refresh cookie
        const refreshResponse = await api.post('/auth/refresh', {})
        const newAccessToken = refreshResponse.data?.access_token
        if (newAccessToken) {
          setAccessToken(newAccessToken)
          // Now fetch the user profile with the fresh token
          const meResponse = await api.get('/auth/me', {
            headers: { Authorization: `Bearer ${newAccessToken}` },
          })
          setUser(meResponse.data)
        } else {
          // No token returned — not logged in
          sessionStorage.removeItem(SESSION_USER_KEY)
          useAuthStore.setState({ user: null })
        }
      } catch {
        // Cookie missing or expired — user is not logged in
        // Don't clear sessionStorage here — network errors shouldn't log out
        // Only clear if it was a 401 (genuinely not authenticated)
        sessionStorage.removeItem(SESSION_USER_KEY)
        useAuthStore.setState({ user: null, accessToken: null })
      } finally {
        setLoading(false)
      }
    }

    rehydrate()

    const fallback = setTimeout(() => {
      if (useAuthStore.getState().isLoading) setLoading(false)
    }, 5000)

    return () => clearTimeout(fallback)
  }, [setAccessToken, setLoading, setUser])

  // Step 4: Proactive access token refresh 5 minutes before expiry
  useEffect(() => {
    const decoded = decodeJwt(accessToken)
    if (!decoded?.exp) return undefined
    const refreshAt = decoded.exp * 1000 - Date.now() - 5 * 60 * 1000
    if (refreshAt <= 0) return undefined

    const timeout = window.setTimeout(async () => {
      try {
        const response = await api.post('/auth/refresh', {})
        const newToken = response.data?.access_token
        if (newToken) setAccessToken(newToken)
      } catch {
        logout()
      }
    }, refreshAt)

    return () => window.clearTimeout(timeout)
  }, [accessToken, logout, setAccessToken])

  const value = useMemo(() => ({ ...authState, decodeJwt }), [authState])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function redirectPathForRole(role) {
  return { customer: '/customer/dashboard', vehicle_manager: '/manager/dashboard', admin: '/admin/dashboard' }[role] || '/'
}

export function useAuth() {
  return useContext(AuthContext)
}
