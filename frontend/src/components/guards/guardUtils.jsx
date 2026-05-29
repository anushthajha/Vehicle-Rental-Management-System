// guardUtils.jsx — shared loading screen and outlet helpers
// These are kept for backward compatibility with any components that import them directly.
// The primary route guards are now in RouteGuards.jsx.

import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-50">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-[#E31837]" />
    </main>
  )
}

export function AuthenticatedOutlet() {
  const location = useLocation()
  const { user, isLoading } = useAuth()
  if (isLoading) return <LoadingScreen />
  if (!user) {
    return <Navigate to="/auth/login" state={{ from: `${location.pathname}${location.search}` }} replace />
  }
  return <Outlet />
}

export function RoleOutlet({ allowedRoles, requiredRole }) {
  const location = useLocation()
  const { user, isLoading } = useAuth()
  if (isLoading) return <LoadingScreen />
  if (!user) {
    return <Navigate to="/auth/login" state={{ from: `${location.pathname}${location.search}` }} replace />
  }
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" state={{ requiredRole, from: location.pathname }} replace />
  }
  return <Outlet />
}
