import React from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BarChart3, CalendarDays, Car, ClipboardList, Gauge, LogOut, Plus, UserRound, Wallet } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import ManagerSidebar from '../../components/layout/ManagerSidebar'

const links = [
  { to: '/manager/dashboard', label: 'Dashboard', icon: Gauge },
  { to: '/manager/vehicles', label: 'My Vehicles', icon: Car },
  { to: '/manager/bookings', label: 'Booking Requests', icon: ClipboardList },
  { to: '/manager/availability', label: 'Availability Overview', icon: CalendarDays },
  { to: '/manager/statistics', label: 'Rental Statistics', icon: BarChart3 },
  { to: '/manager/profile', label: 'My Profile', icon: UserRound },
  { to: '/manager/payouts', label: 'Earnings & Payouts', icon: Wallet },
]

export default function ManagerLayout() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  async function handleLogout() {
    await logout()
    navigate('/auth/login', { replace: true })
  }
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <ManagerSidebar />
      <section className="lg:pl-64">
        <div className="border-b border-zinc-200 bg-[#1E3A5F] px-4 py-3 lg:hidden">
          <div className="flex gap-2 overflow-x-auto">
            {links.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `shrink-0 rounded-md px-3 py-2 text-sm font-black ${isActive ? 'bg-[#E31837] text-white' : 'bg-white/10 text-white'}`}>{item.label}</NavLink>)}
          </div>
        </div>
        <header className="hidden h-16 items-center justify-end border-b border-zinc-200 bg-white px-6 lg:flex">
          <button type="button" onClick={handleLogout} className="inline-flex items-center gap-2 rounded-md border border-zinc-200 px-4 py-2 text-sm font-black text-zinc-700 hover:border-[#1E3A5F]"><LogOut size={18} /> Logout</button>
        </header>
        <Outlet />
      </section>
    </main>
  )
}
