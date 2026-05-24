import React, { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BadgeIndianRupee,
  BarChart3,
  CalendarDays,
  Car as Vehicle,
  ChevronLeft,
  CreditCard,
  Headphones,
  IdCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Tags,
  Users,
} from 'lucide-react'
import { useAuthStore } from '../../context/AuthContext'
import { getAdmin, initials } from './adminApi'

const navItems = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/vehicles', label: 'Vehicles', icon: Vehicle, badgeKey: 'car_approval_count' },
  { to: '/admin/categories', label: 'Vehicle Categories', icon: Tags },
  { to: '/admin/bookings', label: 'Bookings', icon: CalendarDays },
  { to: '/admin/kyc', label: 'KYC', icon: IdCard, badgeKey: 'kyc_count' },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard },
  { to: '/admin/coupons', label: 'Coupons', icon: Tags },
  { to: '/admin/support', label: 'Support', icon: Headphones, badgeKey: 'support_tickets_count' },
  { to: '/admin/users/managers', label: 'Vehicle Managers', icon: Users },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin/payouts', label: 'Payouts', icon: BadgeIndianRupee, badgeKey: 'payout_requests_count' },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
]

export default function AdminLayout() {
  const { user, logout } = useAuthStore()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [pending, setPending] = useState({})
  const location = useLocation()

  useEffect(() => {
    getAdmin('/stats/overview')
      .then((data) => setPending(data.pending || {}))
      .catch(() => setPending({}))
  }, [location.pathname])

  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <aside className={`fixed inset-y-0 left-0 z-40 hidden flex-col bg-[#1F2937] text-white transition-all lg:flex ${collapsed ? 'w-16' : 'w-60'}`}>
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          {!collapsed && <div className="text-lg font-black tracking-wide">Zoom Admin</div>}
          <button title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed((value) => !value)} className="grid h-9 w-9 place-items-center rounded-md text-white hover:bg-white/10">
            {collapsed ? <Menu size={19} /> : <ChevronLeft size={19} />}
          </button>
        </div>
        <nav className="flex-1 space-y-1 px-2 py-4">
          {navItems.map((item) => {
            const Icon = item.icon
            const count = pending[item.badgeKey] || 0
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={item.label}
                className={({ isActive }) =>
                  `flex h-11 items-center gap-3 rounded-md px-3 text-sm font800 font-bold transition ${isActive ? 'bg-[#E31837] text-white' : 'text-zinc-200 hover:bg-white/10 hover:text-white'}`
                }
              >
                <Icon size={20} className="shrink-0" />
                {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                {!collapsed && count > 0 && <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-[#E31837]">{count}</span>}
              </NavLink>
            )
          })}
        </nav>
      </aside>
      <section className={`min-h-screen transition-all ${collapsed ? 'lg:pl-16' : 'lg:pl-60'}`}>
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-zinc-200 bg-white px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="grid h-11 w-11 place-items-center rounded-md border border-zinc-200 text-zinc-700 lg:hidden" aria-label="Open admin menu"><Menu size={20} /></button>
            <div>
            <p className="text-xs font-black uppercase tracking-wide text-[#E31837]">Admin Console</p>
            <h1 className="text-lg font-black text-zinc-950">Operations Dashboard</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-zinc-900 text-sm font-black text-white">{initials(user?.full_name)}</div>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-black">{user?.full_name || 'Admin'}</p>
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-black text-[#E31837]">{user?.role || 'admin'}</span>
            </div>
            <button title="Log out" onClick={logout} className="grid h-10 w-10 place-items-center rounded-md border border-zinc-200 text-zinc-700 hover:border-[#E31837] hover:text-[#E31837]">
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <div className="px-6 py-6">
          <Outlet />
        </div>
      </section>
      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 lg:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[min(88vw,18rem)] bg-[#1F2937] p-3 text-white lg:hidden">
            <Dialog.Title className="sr-only">Admin navigation</Dialog.Title>
            <div className="px-3 py-4 text-lg font-black">Zoom Admin</div>
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const count = pending[item.badgeKey] || 0
                return (
                  <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMobileOpen(false)} className={({ isActive }) => `flex h-11 items-center gap-3 rounded-md px-3 text-sm font-bold ${isActive ? 'bg-[#E31837]' : 'text-zinc-200 hover:bg-white/10'}`}>
                    <Icon size={20} />
                    <span className="flex-1">{item.label}</span>
                    {count > 0 && <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-[#E31837]">{count}</span>}
                  </NavLink>
                )
              })}
            </nav>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  )
}
