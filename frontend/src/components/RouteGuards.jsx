import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { redirectPathForRole, useAuth } from '../context/AuthContext'

function PageLoader() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#F9FAFB]">
      <div className="h-11 w-11 animate-spin rounded-full border-4 border-zinc-200 border-t-[#E31837]" />
    </main>
  )
}

export function AdminRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  if (isLoading) return <PageLoader />
  if (!user) return <Navigate to="/auth/login" state={{ from: location.pathname }} replace />
  if (user.role !== 'admin') return <Navigate to="/unauthorized" replace />
  return <Outlet />
}

export function VehicleManagerRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  if (isLoading) return <PageLoader />
  if (!user) return <Navigate to="/auth/login" state={{ from: location.pathname }} replace />
  if (user.role !== 'vehicle_manager') return <Navigate to="/unauthorized" replace />
  return <Outlet />
}

export function CustomerRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  if (isLoading) return <PageLoader />
  if (!user) return <Navigate to="/auth/login" state={{ from: location.pathname }} replace />
  if (user.role !== 'customer') return <Navigate to="/unauthorized" replace />
  return <Outlet />
}

export function PrivateRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  if (isLoading) return <PageLoader />
  if (!user) return <Navigate to="/auth/login" state={{ from: `${location.pathname}${location.search}` }} replace />
  // Booking-flow pages are customer-only — redirect managers/admins to their own dashboard
  const bookingFlowPaths = ['/booking/confirm/', '/booking/pay/', '/booking/success', '/booking/review/']
  const isBookingFlow = bookingFlowPaths.some((p) => location.pathname.startsWith(p))
  if (isBookingFlow && user.role !== 'customer') {
    return <Navigate to={redirectPathForRole(user.role)} replace />
  }
  return <Outlet />
}

export function LoggedOutRoute() {
  const { user, isLoading } = useAuth()
  if (isLoading) return <PageLoader />
  if (user) return <Navigate to={redirectPathForRole(user.role)} replace />
  return <Outlet />
}
