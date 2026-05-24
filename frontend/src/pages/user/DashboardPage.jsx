import React, { useEffect, useMemo, useState } from 'react'
import { Bell, CalendarDays, Car, Clock3, Copy, LifeBuoy, Route, ShieldCheck, Wallet } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { differenceInCalendarDays, formatDistanceToNow, parseISO } from 'date-fns'
import api from '../../services/api'
import { useAuthStore } from '../../context/AuthContext'
import { bookingDuration, formatDateTime, moneyLabel, statusClass } from '../../utils/bookingUtils'

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
  const [profile, setProfile] = useState(null)
  const [bookings, setBookings] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [profileResponse, bookingsResponse, notificationsResponse] = await Promise.all([
        api.get('/users/profile').catch(() => ({ data: {} })),
        api.get('/bookings/', { params: { as_role: 'customer', limit: 20 } }).catch(() => ({ data: { bookings: [] } })),
        api.get('/notifications', { params: { limit: 5 } }).catch(() => ({ data: { notifications: [] } })),
      ])
      setProfile(profileResponse.data)
      setBookings(bookingsResponse.data.bookings || [])
      setNotifications(notificationsResponse.data.notifications || [])
      setLoading(false)
    }
    load()
  }, [])

  const firstName = useMemo(() => (profile?.user?.full_name || user?.full_name || 'there').split(' ')[0], [profile, user])
  const active = bookings.filter((booking) => booking.status === 'active')
  const upcoming = bookings.filter((booking) => ['pending', 'confirmed', 'approved'].includes(booking.status)).slice(0, 3)
  const completed = Number(profile?.total_trips_as_guest || bookings.filter((booking) => booking.status === 'completed').length)

  return (
    <main className="min-h-screen bg-[#F7F7F8] text-zinc-950">
      <Helmet><title>Customer Dashboard | SigFleet</title><meta name="robots" content="noindex" /></Helmet>
      <CustomerTopNav />
      <div className="mx-auto max-w-7xl px-4 py-6 pb-24 lg:py-8">
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

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Stat icon={Car} label="Active Rentals" value={active.length} />
              <Stat icon={CalendarDays} label="Upcoming Rentals" value={upcoming.length} />
              <Stat icon={ShieldCheck} label="Completed Trips" value={completed} />
              <Stat icon={Wallet} label="Wallet Balance" value={moneyLabel(profile?.wallet_balance || 0)} to="/customer/wallet" action="Add Money" />
            </section>

            <DashboardSection title="Active Rentals">
              {active.length ? active.map((booking) => <ActiveRental key={booking.id} booking={booking} />) : <EmptyRental />}
            </DashboardSection>

            <DashboardSection title="Upcoming Rentals">
              {upcoming.length ? upcoming.map((booking) => <UpcomingRental key={booking.id} booking={booking} />) : <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center font-black text-zinc-500">No upcoming bookings.</p>}
            </DashboardSection>

            <DashboardSection title="Recent Activity">
              <div className="grid gap-3">
                {notifications.length ? notifications.map((item) => <ActivityItem key={item._id || item.id} item={item} />) : bookings.slice(0, 5).map((booking) => <ActivityItem key={booking.id} item={{ title: `${booking.booking_ref || 'Booking'} ${booking.status}`, created_at: booking.updated_at || booking.created_at }} />)}
              </div>
            </DashboardSection>
          </div>
        )}
      </div>
      <CustomerBottomNav />
    </main>
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

function Stat({ icon: Icon, label, value, to, action }) {
  const body = <article className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"><Icon className="text-[#E31837]" /><p className="mt-4 text-sm font-black text-zinc-500">{label}</p><p className="mt-1 text-3xl font-black">{value}</p>{action && <p className="mt-2 text-sm font-black text-[#E31837]">{action}</p>}</article>
  return to ? <Link to={to}>{body}</Link> : body
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
