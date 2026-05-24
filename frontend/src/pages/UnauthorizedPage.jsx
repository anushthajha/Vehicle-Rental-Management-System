import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAuthStore } from '../context/AuthContext'

const dashboards = {
  customer: '/customer/dashboard',
  vehicle_manager: '/manager/dashboard',
  admin: '/admin/dashboard',
}

export default function UnauthorizedPage() {
  const location = useLocation()
  const { user } = useAuthStore()
  const requiredRole = location.state?.requiredRole
  const dashboard = dashboards[user?.role] || '/'

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-50 px-4">
      <section className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <ShieldAlert className="mx-auto text-sigfleet" size={48} />
        <h1 className="mt-5 text-2xl font-black text-zinc-950">You don't have permission to access this page.</h1>
        <p className="mt-3 text-sm font-bold text-zinc-500">
          {requiredRole ? `${requiredRole} access is required. ` : ''}
          Vehicle Manager access is assigned by an admin.
        </p>
        <Link to={dashboard} className="mt-6 inline-flex rounded-md bg-sigfleet px-5 py-3 font-black text-white">
          Go to my dashboard
        </Link>
      </section>
    </main>
  )
}
