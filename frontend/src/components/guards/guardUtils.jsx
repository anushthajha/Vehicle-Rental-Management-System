import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../context/AuthContext'

export function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-50">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-sigfleet" />
    </main>
  )
}

export function AuthenticatedOutlet() {
  const location = useLocation()
  const { user, isLoading } = useAuthStore()
  if (isLoading) return <LoadingScreen />
  if (!user) {
    return <Navigate to={`/auth/login?next=${encodeURIComponent(location.pathname)}`} state={{ from: location }} replace />
  }
  return <Outlet />
}

export function RoleOutlet({ allowedRoles, requiredRole }) {
  const location = useLocation()
  const { user, isLoading } = useAuthStore()
  if (isLoading) return <LoadingScreen />
  if (!user) {
    return <Navigate to={`/auth/login?next=${encodeURIComponent(location.pathname)}`} state={{ from: location }} replace />
  }
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" state={{ requiredRole, from: location.pathname }} replace />
  }
  return <Outlet />
}
