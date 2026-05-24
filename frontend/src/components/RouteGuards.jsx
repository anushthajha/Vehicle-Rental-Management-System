import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../context/AuthContext'
import AdminRouteGuard from './guards/AdminRoute'
import CustomerRouteGuard from './guards/CustomerRoute'
import PrivateRouteGuard from './guards/PrivateRoute'
import VehicleManagerRouteGuard from './guards/VehicleManagerRoute'
import { LoadingScreen } from './guards/guardUtils'

export function PrivateRoute() {
  return <PrivateRouteGuard />
}

export function GuestRoute() {
  const { user, isLoading } = useAuthStore()
  if (isLoading) return <LoadingScreen />
  return user ? <Navigate to="/" replace /> : <Outlet />
}

export function CustomerRoute() {
  return <CustomerRouteGuard />
}

export function VehicleManagerRoute() {
  return <VehicleManagerRouteGuard />
}

export function AdminRoute() {
  return <AdminRouteGuard />
}

export const HostRoute = VehicleManagerRoute
