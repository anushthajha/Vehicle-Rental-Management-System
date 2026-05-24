import React from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BarChart3, CalendarDays, Car, ClipboardList, Gauge, LogOut, Plus, UserRound, Wallet } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

const links = [
  { to: '/manager/dashboard', label: 'Dashboard', icon: Gauge },
  { to: '/manager/vehicles', label: 'My Vehicles', icon: Car },
  { to: '/manager/bookings', label: 'Booking Requests', icon: ClipboardList },
  { to: '/manager/availability', label: 'Availability Overview', icon: CalendarDays },
  { to: '/manager/statistics', label: 'Rental Statistics', icon: BarChart3 },
  { to: '/manager/profile', label: 'My Profile', icon: UserRound },
  { to: '/manager/payouts', label: 'Earnings & Payouts', icon: Wallet },
]

export default function HostLayout() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  async function handleLogout() {
    await logout()
    navigate('/auth/login', { replace: true })
  }
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <aside className="fixed inset-y-0 left-0 hidden w-64 bg-[#1E3A5F] text-white lg:block">
        <div className="border-b border-white/10 p-5">
          <p className="text-xs font-black uppercase text-red-300">Manager Console</p>
          <h1 className="mt-1 text-xl font-black">SigFleet Manager</h1>
        </div>
        <nav className="space-y-1 p-3">
          {links.map((item) => {
            const Icon = item.icon
            return <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex items-center gap-3 rounded-md px-3 py-3 text-sm font-black ${isActive ? 'bg-[#E31837] text-white' : 'text-white/85 hover:bg-white/10 hover:text-white'}`}><Icon size={18} />{item.label}</NavLink>
          })}
        </nav>
        <div className="absolute bottom-4 left-3 right-3">
          <NavLink to="/manager/vehicles/add" className="flex items-center justify-center gap-2 rounded-md bg-white px-4 py-3 font-black text-[#1E3A5F]"><Plus size={18} /> Add New Vehicle</NavLink>
          <button type="button" onClick={handleLogout} className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-white/20 px-4 py-3 font-black text-white hover:bg-white/10"><LogOut size={18} /> Logout</button>
        </div>
      </aside>
      <section className="lg:pl-64">
        <div className="border-b border-zinc-200 bg-[#1E3A5F] px-4 py-3 lg:hidden">
          <div className="flex gap-2 overflow-x-auto">
            {links.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `shrink-0 rounded-md px-3 py-2 text-sm font-black ${isActive ? 'bg-[#E31837] text-white' : 'bg-white/10 text-white'}`}>{item.label}</NavLink>)}
          </div>
        </div>
        <Outlet />
      </section>
    </main>
  )
}
