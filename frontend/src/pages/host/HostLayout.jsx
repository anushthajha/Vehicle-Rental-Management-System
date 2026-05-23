import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { BarChart3, CalendarDays, Car, Gauge, IndianRupee, Plus, UserRound, Wallet } from 'lucide-react'

const links = [
  { to: '/host/dashboard', label: 'Dashboard', icon: Gauge },
  { to: '/host/my-cars', label: 'Listings', icon: Car },
  { to: '/host/bookings', label: 'Bookings', icon: CalendarDays },
  { to: '/host/earnings', label: 'Earnings', icon: BarChart3 },
  { to: '/host/payouts', label: 'Payouts', icon: Wallet },
  { to: '/host/profile', label: 'Profile', icon: UserRound },
]

export default function HostLayout() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-zinc-200 bg-white lg:block">
        <div className="border-b border-zinc-200 p-5">
          <p className="text-xs font-black uppercase text-zoomcar">Host Console</p>
          <h1 className="mt-1 text-xl font-black">Zoomcar Host</h1>
        </div>
        <nav className="space-y-1 p-3">
          {links.map((item) => {
            const Icon = item.icon
            return <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex items-center gap-3 rounded-md px-3 py-3 text-sm font-black ${isActive ? 'bg-zoomcar text-white' : 'text-zinc-700 hover:bg-zinc-100'}`}><Icon size={18} />{item.label}</NavLink>
          })}
        </nav>
        <div className="absolute bottom-4 left-3 right-3">
          <NavLink to="/host/list-car" className="flex items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 py-3 font-black text-white"><Plus size={18} /> List New Car</NavLink>
        </div>
      </aside>
      <section className="lg:pl-60">
        <div className="border-b border-zinc-200 bg-white px-4 py-3 lg:hidden">
          <div className="flex gap-2 overflow-x-auto">
            {links.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `shrink-0 rounded-md px-3 py-2 text-sm font-black ${isActive ? 'bg-zoomcar text-white' : 'bg-zinc-100 text-zinc-700'}`}>{item.label}</NavLink>)}
          </div>
        </div>
        <Outlet />
      </section>
    </main>
  )
}
