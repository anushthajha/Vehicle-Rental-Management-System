import React, { useEffect, useMemo, useState } from 'react'
import { Bell, CalendarDays, Car, CheckCircle2, Heart, Home, Loader2, ShieldAlert, ShieldCheck, Wallet } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { formatDistanceToNow, isFuture, parseISO } from 'date-fns'
import api from '../../services/api'
import { useAuthStore } from '../../context/AuthContext'
import { moneyLabel } from '../../utils/bookingUtils'
import DashboardShell from './DashboardShell'

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
        api.get('/users/profile'),
        api.get('/bookings/', { params: { as_role: 'customer', status: 'pending,confirmed', limit: 2 } }),
        api.get('/notifications', { params: { limit: 4 } }).catch(() => ({ data: { notifications: [] } })),
      ])
      setProfile(profileResponse.data)
      setBookings(bookingsResponse.data.bookings || [])
      setNotifications(notificationsResponse.data.notifications || [])
      setLoading(false)
    }
    load()
  }, [])

  const firstName = useMemo(() => (profile?.user?.full_name || user?.full_name || 'there').split(' ')[0], [profile, user])

  return (
    <DashboardShell title={`Good morning, ${firstName}! 👋`} eyebrow="Dashboard">
      <Helmet><title>Dashboard | SigFleet</title><meta name="robots" content="noindex" /></Helmet>
      {loading ? (
        <div className="grid h-80 place-items-center"><Loader2 className="animate-spin text-sigfleet" size={32} /></div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Car} label="Total Trips" value={profile.total_trips_as_guest || 0} />
            <StatCard icon={Wallet} label="Wallet Balance" value={moneyLabel(profile.wallet_balance || 0)} to="/dashboard/wallet" />
            <StatCard icon={CalendarDays} label="Upcoming Trips" value={profile.upcoming_trips_count || 0} />
            <StatCard icon={Heart} label="Saved Cars" value={profile.saved_cars_count || 0} />
          </div>

          <KycBanner status={profile.kyc_status} />

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-black">Upcoming Trips</h2>
                <Link to="/dashboard/bookings" className="text-sm font-black text-sigfleet">View All Bookings</Link>
              </div>
              <div className="mt-4 grid gap-3">
                {bookings.length ? bookings.map((booking) => <TripCard key={booking.id} booking={booking} />) : <EmptyBlock icon={CalendarDays} title="No upcoming trips" action="Book a car" to="/search" />}
              </div>
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-black">Recent Notifications</h2>
                <Link to="/dashboard/notifications" className="text-sm font-black text-sigfleet">View All</Link>
              </div>
              <div className="mt-4 grid gap-3">
                {notifications.length ? notifications.map((item) => <NotificationPreview key={item._id} item={item} />) : <EmptyBlock icon={Bell} title="Nothing new" />}
              </div>
            </section>
          </div>

          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">Quick Actions</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <QuickAction icon="🚗" label="Book a Car" to="/search" />
              <QuickAction icon="🏠" label="Become a Manager" to="/contact" />
              <QuickAction icon="📋" label="Complete KYC" to="/dashboard/kyc" />
              <QuickAction icon="🎫" label="Refer a Friend" to="/dashboard" />
            </div>
          </section>
        </div>
      )}
    </DashboardShell>
  )
}

function StatCard({ icon: Icon, label, value, to }) {
  const body = (
    <div className="flex min-h-32 items-center justify-between rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div>
        <p className="text-sm font-black text-zinc-500">{label}</p>
        <p className="mt-2 text-3xl font-black text-zinc-950">{value}</p>
      </div>
      <span className="grid h-12 w-12 place-items-center rounded-md bg-red-50 text-sigfleet"><Icon size={24} /></span>
    </div>
  )
  return to ? <Link to={to}>{body}</Link> : body
}

function KycBanner({ status }) {
  const states = {
    not_submitted: { icon: ShieldAlert, tone: 'border-amber-200 bg-amber-50 text-amber-900', text: 'Complete KYC to unlock bookings', cta: 'Complete Now →' },
    pending: { icon: ShieldAlert, tone: 'border-amber-200 bg-amber-50 text-amber-900', text: 'Complete KYC to unlock bookings', cta: 'Complete Now →' },
    under_review: { icon: ShieldCheck, tone: 'border-blue-200 bg-blue-50 text-blue-900', text: 'KYC under review. Expected 24-48 hours.' },
    approved: { icon: CheckCircle2, tone: 'border-emerald-200 bg-emerald-50 text-emerald-900', text: "✓ KYC Verified — You're all set!" },
    rejected: { icon: ShieldAlert, tone: 'border-red-200 bg-red-50 text-red-900', text: 'KYC rejected. Please resubmit.', cta: 'Resubmit →' },
  }
  const config = states[status] || states.not_submitted
  const Icon = config.icon
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${config.tone}`}>
      <div className="flex items-center gap-3"><Icon size={24} /><p className="font-black">{config.text}</p></div>
      {config.cta && <Link to="/dashboard/kyc" className="rounded-md bg-white px-4 py-2 text-sm font-black text-zinc-950 shadow-sm">{config.cta}</Link>}
    </div>
  )
}

function TripCard({ booking }) {
  const pickup = booking.pickup_datetime ? parseISO(booking.pickup_datetime) : null
  const countdown = pickup && isFuture(pickup) ? `Trip in ${formatDistanceToNow(pickup)}` : 'Trip starts soon'
  return (
    <Link to={`/dashboard/bookings/${booking.id}`} className="grid gap-3 rounded-lg border border-zinc-200 p-3 transition hover:border-sigfleet sm:grid-cols-[92px_1fr]">
      <img src={booking.car?.primary_image_url || 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=400&q=80'} alt={`${booking.car?.title || 'Booked car'} thumbnail`} loading="lazy" decoding="async" width="96" height="80" className="h-20 w-full rounded-md object-cover sm:w-24" />
      <div>
        <h3 className="font-black">{booking.car?.title || 'Car booking'}</h3>
        <p className="mt-1 text-sm font-bold text-zinc-500">{pickup ? pickup.toLocaleDateString() : 'Date pending'}</p>
        <p className="mt-2 text-sm font-black text-sigfleet">{countdown}</p>
      </div>
    </Link>
  )
}

function NotificationPreview({ item }) {
  return <div className="rounded-md border border-zinc-100 bg-zinc-50 p-3"><p className="font-black">{item.title}</p><p className="mt-1 line-clamp-2 text-sm text-zinc-600">{item.message}</p></div>
}

function EmptyBlock({ icon: Icon, title, action, to }) {
  return <div className="grid min-h-32 place-items-center rounded-lg border border-dashed border-zinc-300 text-center"><div><Icon className="mx-auto text-zinc-400" /><p className="mt-2 font-black text-zinc-600">{title}</p>{action && <Link to={to} className="mt-3 inline-flex rounded-md bg-zinc-950 px-3 py-2 text-sm font-black text-white">{action}</Link>}</div></div>
}

function QuickAction({ icon, label, to }) {
  return <Link to={to} className="flex min-h-20 items-center gap-3 rounded-lg border border-zinc-200 p-4 font-black transition hover:border-sigfleet hover:bg-red-50"><span className="text-2xl">{icon}</span>{label}</Link>
}
