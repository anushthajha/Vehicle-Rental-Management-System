import React, { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { bookingDuration, formatDateTime, moneyLabel, statusClass } from '../../utils/bookingUtils'
import DashboardShell from '../user/DashboardShell'

const TABS = {
  upcoming: ['pending', 'confirmed'],
  active: ['active'],
  history: [], // all past bookings — filtered client-side by is_history
  cancelled: ['cancelled', 'rejected'],
}

// Tab labels
const TAB_LABELS = {
  upcoming: 'Upcoming',
  active: 'Active',
  history: 'History',
  cancelled: 'Cancelled',
}

export default function MyBookingsPage() {
  const [tab, setTab] = useState('upcoming')
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [cancelModal, setCancelModal] = useState(null) // { booking }
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  async function load() {
    setLoading(true)
    try {
      let params
      if (tab === 'history') {
        // History: fetch all bookings, filter client-side for past ones
        params = { as_role: 'customer', limit: 50 }
      } else if (statusFilter) {
        params = { as_role: 'customer', status: statusFilter }
      } else {
        params = { as_role: 'customer', status: TABS[tab].join(',') }
      }
      const response = await api.get('/bookings/', { params })
      setBookings(response?.data?.bookings || [])
    } catch {
      setBookings([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [tab, statusFilter])

  const now = new Date()

  const visible = useMemo(() => {
    let filtered = bookings

    if (tab === 'history') {
      // History: bookings whose return_datetime is in the past (is_history=true)
      // OR completed bookings OR expired pending bookings
      filtered = bookings.filter((b) =>
        b.is_history ||
        b.status === 'completed' ||
        b.is_expired ||
        new Date(b.return_datetime) < now
      )
    } else if (tab === 'upcoming') {
      // Upcoming: pending/confirmed AND return_datetime is in the future
      filtered = bookings.filter((b) =>
        ['pending', 'confirmed'].includes(b.status) &&
        new Date(b.return_datetime) >= now &&
        !b.is_expired
      )
    }

    if (dateFilter) {
      filtered = filtered.filter((b) => b.pickup_datetime?.startsWith(dateFilter))
    }
    return filtered
  }, [bookings, dateFilter, tab, now])

  // Calculate hours to pickup for policy display
  function hoursToPickup(pickupDatetime) {
    if (!pickupDatetime) return Infinity
    return (new Date(pickupDatetime) - new Date()) / (1000 * 60 * 60)
  }

  function getCancellationPolicy(booking) {
    const hours = hoursToPickup(booking.pickup_datetime)
    const total = Number(booking.total_amount || 0)
    if (hours >= 24) {
      return {
        free: true,
        refund: total,
        charge: 0,
        label: '✓ Free cancellation',
        detail: `Full refund of ${moneyLabel(total)} will be credited to your wallet.`,
        color: 'text-emerald-700',
        bg: 'bg-emerald-50 border-emerald-200',
      }
    }
    const charge = Math.round(total * 0.10)
    const refund = total - charge
    return {
      free: false,
      refund,
      charge,
      label: '⚠ Late cancellation — 10% charge applies',
      detail: `₹${charge.toLocaleString('en-IN')} will be charged. You'll receive ₹${refund.toLocaleString('en-IN')} refund.`,
      color: 'text-amber-700',
      bg: 'bg-amber-50 border-amber-200',
    }
  }

  async function confirmCancel() {
    if (!cancelModal) return
    if (!cancelReason.trim()) {
      toast.error('Please enter a reason for cancellation')
      return
    }
    setCancelling(true)
    try {
      const response = await api.post(`/bookings/${cancelModal.id}/cancel`, { reason: cancelReason.trim() })
      const data = response.data
      toast.success(data.message || 'Booking cancelled successfully')
      setCancelModal(null)
      setCancelReason('')
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || 'Failed to cancel booking')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <DashboardShell title="My Bookings" eyebrow="Trips">
      <section>
        <div className="mt-5 flex flex-wrap gap-2">
          {Object.keys(TABS).map((item) => (
            <button
              key={item}
              onClick={() => { setTab(item); setStatusFilter('') }}
              className={`rounded-md px-4 py-2 font-black capitalize ${tab === item ? 'bg-sigfleet text-white' : 'bg-white text-zinc-700'}`}
            >
              {TAB_LABELS[item] || item}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <input type="date" className="input h-11 w-48" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          <select className="input h-11 w-48" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tab statuses</option>
            {['pending', 'confirmed', 'active', 'completed', 'cancelled', 'rejected'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="grid h-64 place-items-center"><Loader2 className="animate-spin text-sigfleet" /></div>
        ) : visible.length ? (
          <div className="mt-5 grid gap-4">
            {visible.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                onCancelClick={() => { setCancelModal(booking); setCancelReason('') }}
              />
            ))}
          </div>
        ) : (
          <div className="mt-6 grid min-h-80 place-items-center rounded-lg border border-dashed border-zinc-300 bg-white text-center">
            <div>
              <CalendarDays className="mx-auto text-sigfleet" size={42} />
              <h2 className="mt-3 text-2xl font-black text-zinc-950">No bookings yet</h2>
              <Link to="/vehicles" className="mt-4 inline-flex rounded-md bg-sigfleet px-4 py-3 font-black text-white">Explore vehicles</Link>
            </div>
          </div>
        )}
      </section>

      {/* Cancellation confirmation modal */}
      {cancelModal && (() => {
        const policy = getCancellationPolicy(cancelModal)
        return (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
              <h3 className="text-xl font-black text-zinc-950">Cancel Booking</h3>
              <p className="mt-1 text-sm font-bold text-zinc-500">{cancelModal.car?.title} · {cancelModal.booking_ref}</p>

              {/* Policy banner */}
              <div className={`mt-4 rounded-lg border p-4 ${policy.bg}`}>
                <p className={`font-black text-sm ${policy.color}`}>{policy.label}</p>
                <p className={`mt-1 text-sm font-bold ${policy.color}`}>{policy.detail}</p>
              </div>

              {/* Reason input */}
              <div className="mt-4">
                <label className="text-sm font-bold text-zinc-700">
                  Reason for cancellation <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="input mt-1 min-h-20"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Please tell us why you're cancelling..."
                />
              </div>

              <div className="mt-5 flex justify-end gap-3">
                <button
                  onClick={() => { setCancelModal(null); setCancelReason('') }}
                  className="rounded-md border border-zinc-200 px-4 py-2 font-black"
                >
                  Keep Booking
                </button>
                <button
                  onClick={confirmCancel}
                  disabled={cancelling || !cancelReason.trim()}
                  className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 font-black text-white disabled:opacity-60"
                >
                  {cancelling ? <Loader2 size={16} className="animate-spin" /> : null}
                  {policy.free ? 'Cancel (Free)' : `Cancel (₹${policy.charge.toLocaleString('en-IN')} charge)`}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </DashboardShell>
  )
}

function BookingCard({ booking, onCancelClick }) {
  const now = new Date()
  const isPast = new Date(booking?.return_datetime) < now
  const isExpired = booking?.is_expired || (
    booking?.status === 'cancelled' &&
    (booking?.cancellation_reason || '').includes('[EXPIRED]')
  )
  // Can cancel only if upcoming (not past) and status allows it
  const canCancel = ['pending', 'confirmed'].includes(booking?.status) && !isPast

  return (
    <article className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm lg:grid-cols-[140px_1fr_auto]">
      <img
        src={booking?.car?.primary_image_url || 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=500&q=80'}
        alt=""
        className="h-28 w-full rounded-md object-cover lg:w-36"
      />
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-black text-zinc-950">{booking?.car?.title || 'Vehicle booking'}</h2>
          {isExpired ? (
            <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-black text-orange-700">
              Expired — Not Accepted
            </span>
          ) : (
            <span className={`rounded-full px-2 py-1 text-xs font-black capitalize ${statusClass(booking?.status)}`}>
              {booking?.status || 'pending'}
            </span>
          )}
          {isPast && !isExpired && booking?.status !== 'cancelled' && (
            <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-black text-zinc-600">Past</span>
          )}
        </div>
        <p className="mt-2 font-bold text-zinc-500">
          {formatDateTime(booking?.pickup_datetime)} — {formatDateTime(booking?.return_datetime)}
        </p>
        <p className="mt-1 font-bold text-zinc-500">
          {bookingDuration(booking || {})} · {moneyLabel(booking?.total_amount)}
        </p>
        {/* Expired: show refund + fine info */}
        {isExpired && Number(booking?.refund_amount) > 0 && (
          <p className="mt-1 text-sm font-bold text-emerald-700">
            ✓ Refunded: {moneyLabel(booking.refund_amount)} (manager did not accept)
          </p>
        )}
        {/* Cancelled: show refund info */}
        {!isExpired && booking?.status === 'cancelled' && Number(booking?.refund_amount) > 0 && (
          <p className="mt-1 text-sm font-bold text-emerald-700">
            Refunded: {moneyLabel(booking.refund_amount)}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link to={`/customer/bookings/${booking?.id}`} className="rounded-md bg-zinc-950 px-4 py-2 font-black text-white">
          View Details
        </Link>
        {canCancel && (
          <button
            onClick={onCancelClick}
            className="rounded-md border border-red-200 bg-red-50 px-4 py-2 font-black text-red-700 hover:bg-red-100 transition"
          >
            Cancel
          </button>
        )}
        {booking?.status === 'completed' && !booking?.has_reviewed && (
          <Link to={`/booking/review/${booking?.id}`} className="rounded-md border border-zinc-300 px-4 py-2 font-black">
            Write Review
          </Link>
        )}
      </div>
    </article>
  )
}
