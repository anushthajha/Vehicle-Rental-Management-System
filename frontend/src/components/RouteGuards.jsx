import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../context/AuthContext'

function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-50">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-zoomcar" />
    </main>
  )
}

export function PrivateRoute() {
  const location = useLocation()
  const { user, isLoading } = useAuthStore()
  if (isLoading) return <LoadingScreen />
  if (!user) {
    return <Navigate to={`/auth/login?next=${encodeURIComponent(location.pathname)}`} state={{ from: location }} replace />
  }
  return <Outlet />
}

export function GuestRoute() {
  const { user, isLoading } = useAuthStore()
  if (isLoading) return <LoadingScreen />
  return user ? <Navigate to="/" replace /> : <Outlet />
}

export function HostRoute() {
  const { user, isLoading } = useAuthStore()
  if (isLoading) return <LoadingScreen />
  if (!user) return <Navigate to="/auth/login" replace />
  return user.is_host ? <Outlet /> : <Navigate to="/become-a-host" replace />
}

export function AdminRoute() {
  const { user, isLoading } = useAuthStore()
  if (isLoading) return <LoadingScreen />
  if (!user) return <Navigate to="/auth/login" replace />
  return user.role === 'admin' ? <Outlet /> : <Navigate to="/" replace />
}
