import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { create } from 'zustand'
import api from '../services/api'

const STORAGE_KEY = 'sigfleet_auth'

export const useAuthStore = create((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isLoading: true,

  setUser: (user) => set({ user }),

  setTokens: ({ accessToken, refreshToken }) => {
    const nextState = {
      accessToken: accessToken ?? get().accessToken,
      refreshToken: refreshToken ?? get().refreshToken,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState))
    set(nextState)
  },

  hydrateFromStorage: () => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      set({ isLoading: false })
      return
    }
    try {
      const parsed = JSON.parse(raw)
      set({
        accessToken: parsed.accessToken || null,
        refreshToken: parsed.refreshToken || null,
      })
    } catch {
      localStorage.removeItem(STORAGE_KEY)
      set({ isLoading: false })
    }
  },

  // Synchronous logout — clears state immediately, then fires API call in background
  logout: () => {
    const rt = get().refreshToken
    // Step 1: Clear localStorage synchronously
    localStorage.removeItem(STORAGE_KEY)
    // Step 2: Clear Zustand state synchronously
    set({ user: null, accessToken: null, refreshToken: null, isLoading: false })
    // Step 3: Fire-and-forget backend call (don't block navigation)
    if (rt) {
      api.post('/auth/logout', { refresh_token: rt }).catch(() => {})
    }
  },

  setLoading: (isLoading) => set({ isLoading }),
}))

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

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const authState = useAuthStore()
  const { accessToken, refreshToken, setTokens, setUser, logout, hydrateFromStorage, setLoading } = authState

  // Step 1: Hydrate tokens from localStorage on mount
  useEffect(() => {
    hydrateFromStorage()
  }, [hydrateFromStorage])

  // Step 2: Set up axios interceptors for auth header + 401 token refresh
  useEffect(() => {
    const requestInterceptor = api.interceptors.request.use((config) => {
      const token = useAuthStore.getState().accessToken
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    })

    const responseInterceptor = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const original = error.config
        const storedRefreshToken = useAuthStore.getState().refreshToken

        // Attempt token refresh on 401, but only once per request
        if (
          error.response?.status === 401 &&
          storedRefreshToken &&
          !original?._retry &&
          !original?.url?.includes('/auth/refresh') &&
          !original?.url?.includes('/auth/logout')
        ) {
          original._retry = true
          try {
            const response = await api.post('/auth/refresh', { refresh_token: storedRefreshToken })
            const newAccessToken = response.data?.access_token
            if (newAccessToken) {
              setTokens({ accessToken: newAccessToken })
              original.headers = original.headers || {}
              original.headers.Authorization = `Bearer ${newAccessToken}`
              return api(original)
            }
          } catch {
            // Refresh failed — log out and redirect
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
  }, [logout, navigate, setTokens])

  // Step 3: Fetch /auth/me ONCE on mount (or when accessToken first appears)
  // Use a ref to prevent re-runs caused by store updates triggering the dependency
  const rehydratedRef = useRef(false)

  useEffect(() => {
    // Only run once — prevent the dependency loop where setUser triggers re-render
    // which changes authState reference, which re-runs this effect
    if (rehydratedRef.current) return
    rehydratedRef.current = true

    async function rehydrate() {
      const token = useAuthStore.getState().accessToken
      if (!token) {
        setLoading(false)
        return
      }
      try {
        const response = await api.get('/auth/me')
        setUser(response.data)
      } catch (err) {
        const status = err?.response?.status
        if (status === 401) {
          // Token is invalid/expired — try refresh before giving up
          const storedRefresh = useAuthStore.getState().refreshToken
          if (storedRefresh) {
            try {
              const refreshResponse = await api.post('/auth/refresh', { refresh_token: storedRefresh })
              const newAccessToken = refreshResponse.data?.access_token
              if (newAccessToken) {
                setTokens({ accessToken: newAccessToken })
                const meResponse = await api.get('/auth/me', {
                  headers: { Authorization: `Bearer ${newAccessToken}` },
                })
                setUser(meResponse.data)
                return // success via refresh
              }
            } catch {
              // Refresh also failed — clear everything
            }
          }
          localStorage.removeItem(STORAGE_KEY)
          useAuthStore.setState({ user: null, accessToken: null, refreshToken: null })
        }
        // For network errors (backend down, timeout, etc.) — do NOT clear tokens.
        // The user is still logged in; the backend was just temporarily unreachable.
        // isLoading will be set to false in finally, and the app will work once backend is back.
      } finally {
        setLoading(false)
      }
    }

    rehydrate()

    const fallback = setTimeout(() => {
      if (useAuthStore.getState().isLoading) {
        setLoading(false)
      }
    }, 5000)

    return () => clearTimeout(fallback)
  }, [accessToken, setLoading, setUser]) // accessToken in deps so it re-runs if token changes (e.g. after refresh)

  // Step 4: Proactive token refresh 5 minutes before expiry
  useEffect(() => {
    const decoded = decodeJwt(accessToken)
    if (!decoded?.exp || !refreshToken) return undefined
    const refreshAt = decoded.exp * 1000 - Date.now() - 5 * 60 * 1000
    if (refreshAt <= 0) return undefined // already expired or about to expire

    const timeout = window.setTimeout(async () => {
      try {
        const response = await api.post('/auth/refresh', { refresh_token: refreshToken })
        const newToken = response.data?.access_token
        if (newToken) setTokens({ accessToken: newToken })
      } catch {
        logout()
      }
    }, refreshAt)

    return () => window.clearTimeout(timeout)
  }, [accessToken, refreshToken, logout, setTokens])

  const value = useMemo(() => ({ ...authState, decodeJwt }), [authState])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function redirectPathForRole(role) {
  const destinations = {
    customer: '/customer/dashboard',
    vehicle_manager: '/manager/dashboard',
    admin: '/admin/dashboard',
  }
  return destinations[role] || '/'
}

export function useAuth() {
  return useContext(AuthContext)
}
