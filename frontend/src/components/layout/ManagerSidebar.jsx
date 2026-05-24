import React from 'react'
import { NavLink } from 'react-router-dom'
import { BarChart3, CalendarDays, Car, ClipboardList, Gauge, Headphones, Plus, UserRound, Wallet } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

const links = [
  { to: '/manager/dashboard', label: 'Dashboard', icon: Gauge },
  { to: '/manager/vehicles', label: 'My Vehicles', icon: Car },
  { to: '/manager/vehicles/add', label: 'Add Vehicle', icon: Plus },
  { to: '/manager/bookings', label: 'Bookings', icon: ClipboardList },
  { to: '/manager/availability', label: 'Availability', icon: CalendarDays },
  { to: '/manager/statistics', label: 'Statistics', icon: BarChart3 },
  { to: '/manager/earnings', label: 'Earnings', icon: Wallet },
  { to: '/manager/payouts', label: 'Payouts', icon: Wallet },
  { to: '/manager/profile', label: 'Profile', icon: UserRound },
]

function initials(name = 'Vehicle Manager') {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

export default function ManagerSidebar() {
  const { user } = useAuth()
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-[#1E3A5F] text-white lg:flex">
      <div className="border-b border-white/10 p-5">
        <div className="text-2xl font-black tracking-tight">SigFleet</div>
        <p className="mt-1 text-xs font-black uppercase text-teal-200">Manager Console</p>
      </div>
      <div className="m-4 rounded-md bg-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-full bg-teal-400 text-sm font-black text-[#0F2742]">{initials(user?.full_name)}</div>
          <div className="min-w-0">
            <p className="truncate font-black">{user?.full_name || 'Vehicle Manager'}</p>
            <span className="mt-1 inline-flex rounded-full bg-teal-300/20 px-2 py-0.5 text-xs font-black text-teal-100">Vehicle Manager</span>
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {links.map((item) => {
          const Icon = item.icon
          return (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex h-11 items-center gap-3 rounded-md px-3 text-sm font-black transition ${isActive ? 'bg-teal-400 text-[#0F2742]' : 'text-white/85 hover:bg-white/10 hover:text-white'}`}>
              <Icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>
      <div className="border-t border-white/10 p-4">
        <NavLink to="/manager/support" className="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-black text-white/85 hover:bg-white/10">
          <Headphones size={18} /> Help & Support
        </NavLink>
        <p className="mt-4 px-3 text-xs font-bold text-white/45">Build Phase D · v0.4</p>
      </div>
    </aside>
  )
}
