import React, { createContext, useContext, useEffect, useMemo } from 'react'
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
    }
  },
  logout: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ user: null, accessToken: null, refreshToken: null, isLoading: false })
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

  useEffect(() => {
    hydrateFromStorage()
  }, [hydrateFromStorage])

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
        if (error.response?.status === 401 && storedRefreshToken && !original?._retry && !original?.url?.includes('/auth/refresh')) {
          original._retry = true
          try {
            const response = await api.post('/auth/refresh', { refresh_token: storedRefreshToken })
            setTokens({ accessToken: response.data.access_token })
            original.headers.Authorization = `Bearer ${response.data.access_token}`
            return api(original)
          } catch {
            logout()
            navigate('/auth/login')
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

  useEffect(() => {
    async function rehydrate() {
      if (!accessToken) {
        setLoading(false)
        return
      }
      try {
        const response = await api.get('/auth/me')
        setUser(response.data)
      } catch {
        logout()
      } finally {
        setLoading(false)
      }
    }
    rehydrate()
  }, [accessToken, logout, setLoading, setUser])

  useEffect(() => {
    const decoded = decodeJwt(accessToken)
    if (!decoded?.exp || !refreshToken) return undefined
    const refreshAt = decoded.exp * 1000 - Date.now() - 5 * 60 * 1000
    const timeout = window.setTimeout(async () => {
      try {
        const response = await api.post('/auth/refresh', { refresh_token: refreshToken })
        setTokens({ accessToken: response.data.access_token })
      } catch {
        logout()
      }
    }, Math.max(refreshAt, 0))
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
