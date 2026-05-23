import React, { useEffect, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, Heart, Menu, User, Wallet, X } from 'lucide-react'
import api from '../../services/api'
import { useAuthStore } from '../../context/AuthContext'
import NotificationBell from './NotificationBell'

function initials(name = 'User') {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

export default function Navbar() {
  const { user, logout } = useAuthStore()
  const [scrolled, setScrolled] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [wallet, setWallet] = useState(0)
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
  }, [user])

  const nav = [
    ['Explore', '/search'],
    ['How it Works', '/how-it-works'],
    ['List Your Car', '/become-a-host'],
  ]

  const logoutAndGo = () => {
    logout()
    navigate('/')
  }

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition ${scrolled ? 'border-b border-white/20 bg-white/90 shadow-sm backdrop-blur' : 'bg-white/10 backdrop-blur-sm'}`}>
      <nav className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between px-4 py-4">
        <Link to="/" className="font-display text-2xl font-black tracking-tight">
          <span className="text-[#E31837]">Zoom</span><span className={scrolled ? 'text-[#111827]' : 'text-white drop-shadow'}>car</span>
        </Link>
        <div className="hidden items-center gap-8 md:flex">
          {nav.map(([label, to]) => <NavLink key={to} to={to} className={({ isActive }) => `text-sm font-black ${isActive ? 'text-[#E31837]' : scrolled ? 'text-zinc-800 hover:text-[#E31837]' : 'text-white hover:text-white/80'}`}>{label}</NavLink>)}
        </div>
        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <>
              <NotificationBell />
              <DropdownMenu.Root>
                <DropdownMenu.Trigger className={`flex items-center gap-2 rounded-full border px-2 py-1.5 ${scrolled ? 'border-zinc-200 bg-white text-zinc-900' : 'border-white/30 bg-white/15 text-white'}`}>
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[#E31837] text-sm font-black text-white">{initials(user.full_name)}</span>
                  <ChevronDown size={16} />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" className="z-[60] w-64 rounded-lg border border-zinc-200 bg-white p-2 shadow-xl">
                    <div className="flex items-center gap-3 border-b border-zinc-100 p-3">
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-zinc-900 text-sm font-black text-white">{initials(user.full_name)}</span>
                      <div><p className="font-black">{user.full_name}</p><p className="text-xs font-bold text-zinc-500">{user.email}</p></div>
                    </div>
                    <MenuItem to="/dashboard/profile" icon={User}>My Profile</MenuItem>
                    <MenuItem to="/dashboard/bookings">My Bookings</MenuItem>
                    <MenuItem to="/dashboard/wallet" icon={Wallet}>Wallet (₹{Math.round(wallet).toLocaleString('en-IN')})</MenuItem>
                    <MenuItem to="/wishlist" icon={Heart}>Wishlist</MenuItem>
                    <MenuItem to="/dashboard/kyc">KYC Verification</MenuItem>
                    {user.is_host && <MenuItem to="/host/dashboard">Host Dashboard</MenuItem>}
                    <div className="my-1 border-t border-zinc-100" />
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
        <button onClick={() => setDrawer(true)} className={`grid h-10 w-10 place-items-center rounded-md md:hidden ${scrolled ? 'bg-zinc-100 text-zinc-900' : 'bg-white/15 text-white'}`}><Menu size={21} /></button>
      </nav>
      {drawer && <div className="fixed inset-0 z-[70] bg-black/40 md:hidden" onClick={() => setDrawer(false)}><aside className="ml-auto h-full w-80 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><Link to="/" className="font-display text-2xl font-black"><span className="text-[#E31837]">Zoom</span>car</Link><button onClick={() => setDrawer(false)} className="rounded-md p-2 hover:bg-zinc-100"><X size={20} /></button></div><div className="mt-8 grid gap-2">{nav.map(([label, to]) => <Link key={to} to={to} onClick={() => setDrawer(false)} className="rounded-md px-3 py-3 font-black text-zinc-800 hover:bg-zinc-100">{label}</Link>)}{user ? <><Link to="/dashboard/bookings" className="rounded-md px-3 py-3 font-black">My Bookings</Link>{user.is_host && <Link to="/host/dashboard" className="rounded-md px-3 py-3 font-black">Host Dashboard</Link>}<button onClick={logoutAndGo} className="rounded-md px-3 py-3 text-left font-black text-[#E31837]">Logout</button></> : <><Link to="/auth/login" className="rounded-md border border-zinc-200 px-3 py-3 text-center font-black">Login</Link><Link to="/auth/register" className="rounded-md bg-[#E31837] px-3 py-3 text-center font-black text-white">Register</Link></>}</div></aside></div>}
    </header>
  )
}

function MenuItem({ to, icon: Icon, children }) {
  return <DropdownMenu.Item asChild><Link to={to} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-black text-zinc-700 hover:bg-zinc-100">{Icon && <Icon size={16} />}{children}</Link></DropdownMenu.Item>
}
