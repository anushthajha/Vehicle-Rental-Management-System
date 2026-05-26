import React, { useEffect, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Car as Vehicle,
  ClipboardList,
  BarChart3,
  CreditCard,
  Settings,
  Headphones,
  CalendarDays,
  LogOut,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { useAuthStore } from '../../context/AuthContext'
import SigFleetLogo from './SigFleetLogo'
import toast from 'react-hot-toast'

// Links definition per role
const ROLE_LINKS = {
  admin: [
    { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    {
      label: 'Users',
      icon: Users,
      children: [
        { to: '/admin/users', label: 'Customers', end: true },
        { to: '/admin/users/managers', label: 'Vehicle Managers' },
      ],
    },
    { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
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
    { to: '/vehicles', label: 'Vehicles', icon: Vehicle },
    { to: '/customer/support', label: 'Support', icon: Headphones },
    { to: '/customer/profile', label: 'Settings', icon: Settings },
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

  const [usersExpanded, setUsersExpanded] = useState(
    location.pathname.startsWith('/admin/users')
  )

  useEffect(() => {
    if (location.pathname.startsWith('/admin/users')) {
      setUsersExpanded(true)
    }
  }, [location.pathname])

  const handleLogout = () => {
    logout()
    toast.success('Logged out successfully')
    navigate('/')
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

      {/* User profile summary card inside sidebar */}
      <div className="m-4 rounded-lg bg-zinc-900/60 border border-zinc-800/60 p-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#E31837] text-sm font-black text-white shadow-md">
            {initials(user?.full_name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-white">{user?.full_name || 'SigFleet User'}</p>
            <span className="mt-0.5 inline-flex rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-zinc-400 capitalize">
              {role.replace('_', ' ')}
            </span>
          </div>
        </div>
      </div>

      {/* Sidebar navigation links */}
      <nav className="flex-1 space-y-1 px-3 overflow-y-auto">
        {links.map((item) => {
          const Icon = item.icon
          
          if (item.children) {
            const isChildActive = item.children.some((child) => {
              if (child.end) {
                return location.pathname === child.to
              }
              return location.pathname.startsWith(child.to)
            })

            return (
              <div key={item.label} className="space-y-1">
                <button
                  type="button"
                  onClick={() => setUsersExpanded(!usersExpanded)}
                  className={`flex h-11 w-full items-center justify-between rounded-md px-3 text-sm font-black transition-all duration-200 ${
                    isChildActive
                      ? 'text-white bg-zinc-900/60'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={18} className="shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {usersExpanded ? (
                    <ChevronDown size={16} className="text-zinc-500" />
                  ) : (
                    <ChevronRight size={16} className="text-zinc-500" />
                  )}
                </button>
                {usersExpanded && (
                  <div className="pl-9 space-y-1">
                    {item.children.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        end={child.end}
                        onClick={onCloseMobile}
                        className={({ isActive }) =>
                          `flex h-9 items-center rounded-md px-3 text-xs font-black transition-all duration-200 ${
                            isActive
                              ? 'bg-[#E31837] text-white shadow-md shadow-[#E31837]/15'
                              : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                          }`
                        }
                      >
                        <span className="truncate">{child.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          }

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
