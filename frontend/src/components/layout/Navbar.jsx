import React, { useEffect, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Dialog from '@radix-ui/react-dialog'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { ChevronDown, Heart, Menu, Moon, Sun, User, Wallet, X } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useAuthStore } from '../../context/AuthContext'
import NotificationBell from './NotificationBell'

function initials(name = 'User') {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

const roleDashboards = {
  customer: '/customer/dashboard',
  vehicle_manager: '/manager/dashboard',
  admin: '/admin/dashboard',
}

export default function Navbar() {
  const { user, logout } = useAuthStore()
  const [scrolled, setScrolled] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [wallet, setWallet] = useState(0)
  const [unread, setUnread] = useState(0)
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const navigate = useNavigate()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80)
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!user) return
    api.get('/payments/wallet').then((response) => setWallet(response.data.balance || 0)).catch(() => setWallet(0))
    api.get('/notifications/unread-count').then((response) => setUnread(response.data.count || 0)).catch(() => setUnread(0))
  }, [user])

  const role = user?.role
  const nav = role === 'admin'
    ? [['Dashboard', '/admin/dashboard'], ['Users', '/admin/users'], ['Vehicles', '/admin/vehicles'], ['Bookings', '/admin/bookings'], ['Analytics', '/admin/analytics']]
    : role === 'vehicle_manager'
      ? [['My Vehicles', '/manager/vehicles'], ['Bookings', '/manager/bookings'], ['Availability', '/manager/vehicles']]
      : [['Browse Vehicles', '/vehicles'], ['How it Works', '/how-it-works'], ['Become a Manager', '/contact']]

  const dashboardPath = roleDashboards[role] || '/'

  const logoutAndGo = () => {
    logout()
    toast.success('Logged out')
    navigate('/')
  }

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('sigfleet-theme', next ? 'dark' : 'light')
  }

  const headerTone = scrolled
    ? 'border-b border-zinc-200 bg-white/90 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/90'
    : 'bg-white/10 backdrop-blur-sm'
  const brandTone = scrolled ? 'text-[#111827] dark:text-gray-100' : 'text-white drop-shadow'

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition ${headerTone}`}>
      <nav className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between px-4 py-4">
        <Link to="/" className="font-display text-2xl font-black tracking-tight">
          <span className="text-[#E31837]">Sig</span><span className={brandTone}>Fleet</span>
        </Link>
        <div className="hidden items-center gap-8 md:flex">
          {nav.map(([label, to]) => <NavLink key={to} to={to} className={({ isActive }) => `text-sm font-black ${isActive ? 'text-[#E31837]' : scrolled ? 'text-zinc-800 hover:text-[#E31837]' : 'text-white hover:text-white/80'}`}>{label}</NavLink>)}
        </div>
        <div className="hidden items-center gap-3 md:flex">
          <button onClick={toggleTheme} className={`grid h-11 w-11 place-items-center rounded-md border ${scrolled ? 'border-zinc-200 bg-white text-zinc-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100' : 'border-white/30 bg-white/15 text-white'}`} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          {user ? (
            <>
              <NotificationBell />
              <DropdownMenu.Root>
                <DropdownMenu.Trigger className={`flex min-h-11 items-center gap-2 rounded-full border px-2 py-1.5 ${scrolled ? 'border-zinc-200 bg-white text-zinc-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100' : 'border-white/30 bg-white/15 text-white'}`}>
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[#E31837] text-sm font-black text-white">{initials(user.full_name)}</span>
                  <ChevronDown size={16} />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" className="z-[60] w-64 rounded-lg border border-zinc-200 bg-white p-2 shadow-xl dark:border-gray-700 dark:bg-gray-800">
                    <div className="flex items-center gap-3 border-b border-zinc-100 p-3">
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-zinc-900 text-sm font-black text-white">{initials(user.full_name)}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-black">{user.full_name}</p>
                          {role === 'vehicle_manager' && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black uppercase text-[#E31837]">Manager</span>}
                          {role === 'admin' && <span className="rounded-full bg-red-950 px-2 py-0.5 text-[10px] font-black uppercase text-white">Admin</span>}
                        </div>
                        <p className="text-xs font-bold text-zinc-500">{user.email}</p>
                      </div>
                    </div>
                    {role === 'customer' && (
                      <>
                        <MenuItem to="/customer/dashboard" icon={User}>My Dashboard</MenuItem>
                        <MenuItem to="/customer/bookings">My Bookings</MenuItem>
                        <MenuItem to="/customer/rental-history">Rental History</MenuItem>
                        <MenuItem to="/customer/track-rental">Track Rental</MenuItem>
                        <MenuItem to="/dashboard/wallet" icon={Wallet}>Wallet (₹{Math.round(wallet).toLocaleString('en-IN')})</MenuItem>
                        <MenuItem to="/dashboard/kyc">KYC</MenuItem>
                      </>
                    )}
                    {role === 'vehicle_manager' && (
                      <>
                        <MenuItem to="/manager/dashboard">Manager Dashboard</MenuItem>
                        <MenuItem to="/manager/vehicles">My Vehicles</MenuItem>
                        <MenuItem to="/manager/bookings">Booking Requests</MenuItem>
                        <MenuItem to="/manager/earnings">Rental Statistics</MenuItem>
                      </>
                    )}
                    {role === 'admin' && (
                      <>
                        <MenuItem to="/admin/dashboard">Admin Dashboard</MenuItem>
                        <MenuItem to="/admin/users">User Management</MenuItem>
                        <MenuItem to="/admin/vehicles">Vehicles</MenuItem>
                        <MenuItem to="/admin/analytics">Analytics</MenuItem>
                      </>
                    )}
                    <div className="my-1 border-t border-zinc-100" />
                    <MenuItem to="/dashboard/profile" icon={User}>Profile</MenuItem>
                    {role === 'customer' && <MenuItem to="/wishlist" icon={Heart}>Wishlist</MenuItem>}
                    <MenuItem to="/dashboard/support">Support</MenuItem>
                    <button onClick={logoutAndGo} className="w-full rounded-md px-3 py-2 text-left text-sm font-black text-[#E31837] hover:bg-red-50">Logout</button>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </>
          ) : (
            <>
              <Link to="/auth/login" className={`rounded-md border px-4 py-2 text-sm font-black ${scrolled ? 'border-zinc-300 text-zinc-900' : 'border-white/60 text-white'}`}>Login</Link>
              <Link to="/auth/register" className="rounded-md bg-[#E31837] px-4 py-2 text-sm font-black text-white">Register</Link>
            </>
          )}
        </div>
        <button onClick={() => setDrawer(true)} className={`grid h-11 w-11 place-items-center rounded-md md:hidden ${scrolled ? 'bg-zinc-100 text-zinc-900 dark:bg-gray-800 dark:text-gray-100' : 'bg-white/15 text-white'}`} aria-label="Open navigation menu"><Menu size={21} /></button>
      </nav>
      <Dialog.Root open={drawer} onOpenChange={setDrawer}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/45 md:hidden" />
          <Dialog.Content className="fixed bottom-0 right-0 top-0 z-[71] w-[min(88vw,22rem)] bg-white p-5 shadow-2xl transition dark:bg-gray-900 md:hidden">
            <Dialog.Title className="sr-only">Navigation menu</Dialog.Title>
            <div className="flex items-center justify-between">
              <Link to="/" className="font-display text-2xl font-black text-gray-950 dark:text-gray-100"><span className="text-[#E31837]">Sig</span>Fleet</Link>
              <Dialog.Close className="grid h-11 w-11 place-items-center rounded-md hover:bg-zinc-100 dark:hover:bg-gray-800" aria-label="Close navigation menu"><X size={20} /></Dialog.Close>
            </div>
            <div className="mt-8 grid gap-2">
              <button onClick={toggleTheme} className="flex items-center justify-between rounded-md px-3 py-3 text-left font-black text-zinc-800 hover:bg-zinc-100 dark:text-gray-100 dark:hover:bg-gray-800">
                {dark ? 'Light mode' : 'Dark mode'} {dark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              {nav.map(([label, to]) => <Link key={to} to={to} onClick={() => setDrawer(false)} className="rounded-md px-3 py-3 font-black text-zinc-800 hover:bg-zinc-100 dark:text-gray-100 dark:hover:bg-gray-800">{label}</Link>)}
              {user ? (
                <>
                  <Link to="/dashboard/notifications" onClick={() => setDrawer(false)} className="flex items-center justify-between rounded-md px-3 py-3 font-black text-zinc-800 dark:text-gray-100">Notifications <span className="rounded-full bg-sigfleet px-2 py-0.5 text-xs text-white">{unread}</span></Link>
                  <Link to={dashboardPath} onClick={() => setDrawer(false)} className="rounded-md px-3 py-3 font-black text-zinc-800 dark:text-gray-100">Dashboard</Link>
                  {role === 'customer' && <Link to="/customer/bookings" onClick={() => setDrawer(false)} className="rounded-md px-3 py-3 font-black text-zinc-800 dark:text-gray-100">My Bookings</Link>}
                  <Link to="/dashboard/wallet" onClick={() => setDrawer(false)} className="rounded-md px-3 py-3 font-black text-zinc-800 dark:text-gray-100">Wallet (₹{Math.round(wallet).toLocaleString('en-IN')})</Link>
                  {role === 'vehicle_manager' && <Link to="/manager/bookings" onClick={() => setDrawer(false)} className="rounded-md px-3 py-3 font-black text-zinc-800 dark:text-gray-100">Booking Requests</Link>}
                  <button onClick={logoutAndGo} className="rounded-md px-3 py-3 text-left font-black text-[#E31837]">Logout</button>
                </>
              ) : (
                <>
                  <Link to="/auth/login" onClick={() => setDrawer(false)} className="rounded-md border border-zinc-200 px-3 py-3 text-center font-black dark:border-gray-700 dark:text-gray-100">Login</Link>
                  <Link to="/auth/register" onClick={() => setDrawer(false)} className="rounded-md bg-[#E31837] px-3 py-3 text-center font-black text-white">Register</Link>
                </>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </header>
  )
}

function MenuItem({ to, icon: Icon, children }) {
  return <DropdownMenu.Item asChild><Link to={to} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-black text-zinc-700 hover:bg-zinc-100">{Icon && <Icon size={16} />}{children}</Link></DropdownMenu.Item>
}
