import React, { useState } from 'react'
import { Bell, CalendarDays, Car, ChevronLeft, Headphones, Heart, Home, LayoutDashboard, Settings, ShieldCheck, Star, Wallet } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import NotificationBell from '../../components/layout/NotificationBell'

const NAV_ITEMS = [
  { label: 'Overview', to: '/dashboard', icon: LayoutDashboard },
  { label: 'My Bookings', to: '/dashboard/bookings', icon: CalendarDays },
  { label: 'KYC Verification', to: '/dashboard/kyc', icon: ShieldCheck },
  { label: 'Wallet', to: '/dashboard/wallet', icon: Wallet },
  { label: 'Notifications', to: '/dashboard/notifications', icon: Bell },
  { label: 'Wishlist', to: '/wishlist', icon: Heart },
  { label: 'Reviews', to: '/dashboard/reviews', icon: Star },
  { label: 'Support', to: '/dashboard/support', icon: Headphones },
  { label: 'Settings', to: '/dashboard/profile', icon: Settings },
]

const MOBILE_ITEMS = NAV_ITEMS.slice(0, 5)

export default function DashboardShell({ children, title, eyebrow, actions }) {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  return (
    <main className="min-h-screen bg-zinc-50 pb-24 text-zinc-950 lg:pb-0">
      <aside className={`fixed left-0 top-0 z-30 hidden h-screen border-r border-zinc-200 bg-white transition-all lg:block ${collapsed ? 'w-20' : 'w-72'}`}>
        <div className="flex h-16 items-center justify-between border-b border-zinc-100 px-4">
          <Link to="/" className="flex items-center gap-3 overflow-hidden">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-sigfleet text-white"><Car size={21} /></span>
            {!collapsed && <span className="text-lg font-black">SigFleet</span>}
          </Link>
          <button onClick={() => setCollapsed((value) => !value)} className="grid h-9 w-9 place-items-center rounded-md border border-zinc-200 text-zinc-600" aria-label="Collapse sidebar">
            <ChevronLeft className={collapsed ? 'rotate-180' : ''} size={18} />
          </button>
        </div>
        <nav className="space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) => <NavLink key={item.to} item={item} active={isActive(location.pathname, item.to)} collapsed={collapsed} />)}
        </nav>
      </aside>

      <section className={`transition-all ${collapsed ? 'lg:pl-20' : 'lg:pl-72'}`}>
        <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 px-4 py-4 backdrop-blur lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <div>
              {eyebrow && <p className="text-xs font-black uppercase tracking-wide text-sigfleet">{eyebrow}</p>}
              {title && <h1 className="text-2xl font-black text-zinc-950">{title}</h1>}
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
              {actions}
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">{children}</div>
      </section>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-zinc-200 bg-white lg:hidden">
        {MOBILE_ITEMS.map((item) => {
          const Icon = item.icon
          const active = isActive(location.pathname, item.to)
          return (
            <Link key={item.to} to={item.to} className={`grid min-h-16 place-items-center gap-1 px-1 py-2 text-[11px] font-black ${active ? 'text-sigfleet' : 'text-zinc-500'}`}>
              <Icon size={21} />
              <span className="truncate">{item.label.replace(' Verification', '')}</span>
            </Link>
          )
        })}
      </nav>
    </main>
  )
}

function NavLink({ item, active, collapsed }) {
  const Icon = item.icon
  return (
    <Link to={item.to} className={`flex h-11 items-center gap-3 rounded-md px-3 font-black transition ${active ? 'bg-red-50 text-sigfleet' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950'}`}>
      <Icon className="shrink-0" size={20} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  )
}

function isActive(pathname, to) {
  if (to === '/dashboard') return pathname === '/dashboard'
  return pathname === to || pathname.startsWith(`${to}/`)
}
