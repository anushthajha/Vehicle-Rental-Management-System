import React, { useEffect, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Car as Vehicle,
  ClipboardList,
  CreditCard,
  Settings,
  Headphones,
  CalendarDays,
  BadgeCheck,
  TicketPercent,
  LogOut,
  ChevronDown,
  ChevronRight,
  BarChart3,
  Star,
} from 'lucide-react'
import { useAuthStore } from '../../context/AuthContext'
import SigFleetLogo from './SigFleetLogo'
import toast from 'react-hot-toast'

// Links definition per role
const ROLE_LINKS = {
  admin: [
    { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/vehicles/manage', label: 'Manage Vehicles', icon: Vehicle },
    { to: '/admin/kyc', label: 'Approve KYC', icon: BadgeCheck },
    { to: '/admin/support', label: 'Support', icon: Headphones },
    { to: '/admin/coupons', label: 'Coupons', icon: TicketPercent },
    { to: '/admin/payments', label: 'Payments', icon: CreditCard },
    { to: '/admin/settings', label: 'Settings', icon: Settings },
  ],
  vehicle_manager: [
    { to: '/manager/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/manager/vehicles', label: 'Vehicles', icon: Vehicle },
    { to: '/manager/bookings', label: 'Assignments', icon: ClipboardList },
    { to: '/manager/statistics', label: 'Reports', icon: BarChart3 },
    { to: '/manager/profile', label: 'Settings', icon: Settings },
  ],
  customer: [
    { to: '/customer/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/customer/bookings', label: 'My Bookings', icon: CalendarDays },
    { to: '/vehicles', label: 'Browse Vehicles', icon: Vehicle },
    { to: '/customer/kyc', label: 'KYC Verification', icon: BadgeCheck },
    { to: '/dashboard/reviews', label: 'My Reviews', icon: Star },
    { to: '/customer/profile', label: 'Account Settings', icon: Settings },
  ],
}

const ROLE_SUBTITLES = {
  admin: 'Admin Console',
  vehicle_manager: 'Manager Console',
  customer: 'Customer Panel',
}

function initials(name = 'User') {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

export default function Sidebar({ onCloseMobile }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  const role = user?.role || 'customer'
  const links = ROLE_LINKS[role] || ROLE_LINKS.customer
  const subtitle = ROLE_SUBTITLES[role] || ROLE_SUBTITLES.customer

  const handleLogout = () => {
    logout()
    toast.success('Logged out successfully')
    navigate('/', { replace: true })
    if (onCloseMobile) onCloseMobile()
  }

  return (
    <aside className="flex h-full w-full flex-col bg-zinc-950 text-white">
      {/* Brand Logo Header */}
      <div className="flex h-16 items-center border-b border-zinc-800/80 px-5">
        <div>
          <SigFleetLogo textClassName="text-white" />
          <p className="text-[10px] font-black uppercase tracking-widest text-[#E31837] mt-0.5 ml-11">{subtitle}</p>
        </div>
      </div>

      {/* User profile summary card inside sidebar — click to go to profile */}
      <NavLink
        to={role === 'customer' ? '/customer/profile' : role === 'vehicle_manager' ? '/manager/profile' : '/admin/dashboard'}
        onClick={onCloseMobile}
        className="m-4 block rounded-lg bg-zinc-900/60 border border-zinc-800/60 p-4 hover:bg-zinc-900 transition"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#E31837] text-sm font-black text-white shadow-md">
            {user?.profile_picture
              ? <img src={user.profile_picture} alt="" className="h-10 w-10 rounded-full object-cover" />
              : initials(user?.full_name)
            }
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-white">{user?.full_name || 'SigFleet User'}</p>
            <span className="mt-0.5 inline-flex rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-zinc-400 capitalize">
              {role.replace('_', ' ')}
            </span>
          </div>
        </div>
      </NavLink>

      {/* Sidebar navigation links */}
      <nav className="flex-1 space-y-1 px-3 overflow-y-auto">
        {links.map((item) => {
          const Icon = item.icon

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                `flex h-11 items-center gap-3 rounded-md px-3 text-sm font-black transition-all duration-200 ${
                  isActive
                    ? 'bg-[#E31837] text-white shadow-md shadow-[#E31837]/15'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`
              }
            >
              <Icon size={18} className="shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* Support & Logout Footer */}
      <div className="border-t border-zinc-800/80 p-4 space-y-1">
        {role === 'customer' && (
          <NavLink
            to="/customer/support"
            onClick={onCloseMobile}
            className={({ isActive }) =>
              `flex h-11 items-center gap-3 rounded-md px-3 text-sm font-black transition-all ${
                isActive ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
              }`
            }
          >
            <Headphones size={18} />
            <span>Help & Support</span>
          </NavLink>
        )}
        <button
          onClick={handleLogout}
          className="flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-black text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all"
        >
          <LogOut size={18} />
          <span>Sign Out</span>
        </button>
        <p className="mt-2 text-center text-[10px] font-bold text-zinc-600">SigFleet Console · v1.0</p>
      </div>
    </aside>
  )
}
