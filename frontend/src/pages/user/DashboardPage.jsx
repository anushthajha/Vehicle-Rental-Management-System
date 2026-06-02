import React, { useEffect, useMemo, useState } from 'react'
import { Bell, CalendarDays, Car as Vehicle, ChevronRight, Heart, Route, Wallet } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import { Link, useNavigate } from 'react-router-dom'
import { differenceInCalendarDays, formatDistanceToNow, parseISO } from 'date-fns'
import api from '../../services/api'
import { useAuthStore } from '../../context/AuthContext'
import { bookingDuration, formatDateTime, moneyLabel, statusClass } from '../../utils/bookingUtils'

import DashboardShell from './DashboardShell'

const nav = [
  ['Overview', '/customer/dashboard'],
  ['My Bookings', '/customer/bookings'],
  ['Rental History', '/customer/bookings/history'],
  ['Track Rental', '/customer/track/latest'],
  ['Wallet', '/customer/wallet'],
  ['KYC', '/customer/kyc'],
]

export default function DashboardPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [bookings, setBookings] = useState([])
  const [activeBookings, setActiveBookings] = useState([])
  const [wishlistCount, setWishlistCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        // 3 parallel calls — profile, all bookings (for count + upcoming), wishlist count
        // Active bookings are derived from the same bookings response (no extra call needed)
        // Notifications are handled by NotificationBell — no duplicate fetch here
        const [profileResponse, bookingsResponse, wishlistResponse] = await Promise.all([
          api.get('/users/profile').catch(() => ({ data: {} })),
          api.get('/bookings/', { params: { as_role: 'customer', limit: 50 } }).catch(() => ({ data: { bookings: [] } })),
          api.get('/wishlist/').catch(() => ({ data: { vehicles: [] } })),
        ])
        setProfile(profileResponse.data ?? {})
        const allBookings = bookingsResponse.data?.bookings || []
        setBookings(allBookings)
        // Derive active bookings from the same response — no second /bookings/ call
        setActiveBookings(allBookings.filter((b) => b.status === 'active'))
        setWishlistCount((wishlistResponse.data?.vehicles || []).length)
      } catch {
        // silently fail — page shows empty state
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const firstName = useMemo(() => (profile?.user?.full_name || user?.full_name || 'there').split(' ')[0], [profile, user])
  // Use dedicated active bookings fetch — accurate regardless of total booking count
  const active = activeBookings
  const activeBookingId = active[0]?.id
  // Upcoming: confirmed/pending from the general list, excluding past dates
  const now = new Date()
  const upcoming = bookings
    .filter((b) => ['pending', 'confirmed'].includes(b.status) && new Date(b.return_datetime) >= now)
    .slice(0, 3)
  // Total count: all non-expired bookings
  const totalBookings = bookings.length

  return (
    <DashboardShell title="Dashboard" eyebrow="Customer">
      <Helmet><title>Customer Dashboard | SigFleet</title><meta name="robots" content="noindex" /></Helmet>
      {loading ? <div className="grid h-96 place-items-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-[#E31837]" /></div> : (
        <div className="space-y-6">
          <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-black">Hello, {firstName}! 👋</h1>
                <p className="mt-1 font-semibold text-zinc-500">Your rentals, wallet, and verification in one place.</p>
              </div>
              <KycStatus status={profile?.kyc_status} />
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={CalendarDays} label="My Bookings" value={totalBookings} to="/customer/bookings" />
            <Stat icon={Vehicle} label="Active Trip" value={active.length} to={activeBookingId ? `/customer/track/${activeBookingId}` : '/customer/bookings'} />
            <Stat icon={Wallet} label="Wallet Balance" value={moneyLabel(profile?.wallet_balance || 0)} to="/customer/wallet" action="+ Add Money" onAction={(event) => { event.preventDefault(); event.stopPropagation(); navigate('/customer/wallet') }} />
            <Stat icon={Heart} label="Wishlist" value={wishlistCount} to="/customer/wishlist" />
          </section>

          <DashboardSection title="Active Rentals">
            {active.length ? active.map((booking) => <ActiveRental key={booking.id} booking={booking} />) : <EmptyRental />}
          </DashboardSection>

          <DashboardSection title="Upcoming Rentals">
            {upcoming.length ? upcoming.map((booking) => <UpcomingRental key={booking.id} booking={booking} />) : <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center font-black text-zinc-500">No upcoming bookings.</p>}
          </DashboardSection>
        </div>
      )}
    </DashboardShell>
  )
}


export function CustomerTopNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white">
      <div className="mx-auto hidden h-16 max-w-7xl items-center justify-between px-4 lg:flex">
        <Link to="/" className="text-2xl font-black"><span className="text-[#E31837]">Sig</span>Fleet</Link>
        <nav className="flex items-center gap-1">
          {nav.map(([label, to]) => <Link key={to} to={to} className="rounded-md px-4 py-2 text-sm font-black text-zinc-700 hover:bg-red-50 hover:text-[#E31837]">{label}</Link>)}
        </nav>
      </div>
    </header>
  )
}

function CustomerBottomNav() {
  return <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-zinc-200 bg-white lg:hidden">{nav.slice(0, 5).map(([label, to]) => <Link key={to} to={to} className="px-1 py-3 text-center text-xs font-black text-zinc-600">{label}</Link>)}</nav>
}

function KycStatus({ status }) {
  if (status === 'approved') return <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-black text-emerald-700">✓ KYC Verified</span>
  if (status === 'under_review') return <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-black text-blue-700">KYC Under Review</span>
  return <Link to="/customer/kyc" className="rounded-md bg-amber-50 px-4 py-3 text-sm font-black text-amber-800">Complete KYC to start booking vehicles →</Link>
}

function Stat({ icon: Icon, label, value, to, action, onAction }) {
  const body = <article className="flex h-[190px] flex-col justify-between overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-md"><div className="flex items-center justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50"><Icon className="text-red-600" size={20} /></div><ChevronRight size={16} className="text-gray-400" /></div><div><p className="mt-2 text-2xl font-bold text-gray-900">{value}</p><p className="mt-0.5 text-sm text-gray-500">{label}</p>{action ? <button onClick={onAction} className="mt-1 h-5 text-xs font-medium text-red-600 hover:underline">{action}</button> : <span className="mt-1 block h-5 text-xs">&nbsp;</span>}</div></article>
  return to ? <Link to={to} className="block h-full">{body}</Link> : body
}

function DashboardSection({ title, children }) {
  return <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="text-xl font-black">{title}</h2><div className="mt-4 grid gap-4">{children}</div></section>
}

function ActiveRental({ booking }) {
  const remaining = booking.return_datetime ? Math.max(differenceInCalendarDays(parseISO(booking.return_datetime), new Date()), 0) : 0
  return <article className="grid gap-4 rounded-lg border border-zinc-200 p-4 lg:grid-cols-[160px_1fr_auto]"><VehicleThumb booking={booking} /><div><h3 className="text-xl font-black">{booking.car?.title || 'Vehicle rental'}</h3><p className="font-bold text-zinc-500">{booking.car?.vehicle_type_name || booking.car?.category_name || 'Vehicle'} · Manager {booking.counterparty?.name || booking.manager_name || 'assigned'}</p><p className="mt-2 font-black text-emerald-700">🟢 In Progress</p><p className="mt-2 text-sm font-bold text-zinc-500">{formatDateTime(booking.pickup_datetime)} → {formatDateTime(booking.return_datetime)}</p><span className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{remaining} days remaining</span></div><div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-stretch"><Link to={`/customer/track/${booking.id}`} className="rounded-md bg-[#E31837] px-4 py-2 text-center font-black text-white">Track Status</Link><Link to="/customer/support" className="rounded-md border border-zinc-300 px-4 py-2 text-center font-black">Get Help</Link></div></article>
}

function UpcomingRental({ booking }) {
  const starts = booking.pickup_datetime ? formatDistanceToNow(parseISO(booking.pickup_datetime), { addSuffix: true }) : 'soon'
  return <article className="grid gap-4 rounded-lg border border-zinc-200 p-4 lg:grid-cols-[120px_1fr_auto]"><VehicleThumb booking={booking} /><div><h3 className="font-black">{booking.car?.title || 'Vehicle rental'}</h3><p className="mt-1 text-sm font-bold text-zinc-500">{formatDateTime(booking.pickup_datetime)} → {formatDateTime(booking.return_datetime)} · {bookingDuration(booking)}</p><div className="mt-2 flex flex-wrap gap-2"><span className={`rounded-full px-2 py-1 text-xs font-black capitalize ${statusClass(booking.status)}`}>{booking.status === 'pending' ? 'Pending Approval' : 'Confirmed'}</span><span className="rounded-full bg-red-50 px-2 py-1 text-xs font-black text-[#E31837]">Starts {starts}</span></div></div><div className="flex flex-wrap items-center gap-2"><Link to={`/customer/bookings/${booking.id}`} className="rounded-md bg-zinc-950 px-4 py-2 font-black text-white">View Details</Link><button className="rounded-md border border-red-200 px-4 py-2 font-black text-[#E31837]">Cancel</button></div></article>
}

function VehicleThumb({ booking }) {
  return <img src={booking.car?.primary_image_url || 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=500&q=80'} alt="" className="h-28 w-full rounded-md object-cover lg:h-24" />
}

function EmptyRental() {
  return <div className="grid min-h-56 place-items-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 text-center"><div><Route className="mx-auto text-[#E31837]" size={42} /><h3 className="mt-3 text-xl font-black">No active rentals. Ready for your next trip?</h3><Link to="/vehicles" className="mt-4 inline-flex rounded-md bg-[#E31837] px-4 py-3 font-black text-white">Browse Vehicles</Link></div></div>
}

function ActivityItem({ item }) {
  const when = item.created_at ? formatDistanceToNow(new Date(item.created_at), { addSuffix: true }) : 'just now'
  return <div className="flex items-center gap-3 rounded-md bg-zinc-50 p-3"><Bell className="text-[#E31837]" size={18} /><p className="flex-1 font-bold">{item.title || item.message || 'Booking activity updated'}</p><span className="text-sm font-bold text-zinc-500">{when}</span></div>
}
