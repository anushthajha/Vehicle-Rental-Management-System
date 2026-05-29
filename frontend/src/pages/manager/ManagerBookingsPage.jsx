import React, { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, CheckCircle2, Clock, Loader2, Play, Square, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { bookingDuration, formatDateTime, moneyLabel, statusClass } from '../../utils/bookingUtils'

const TABS = {
  pending: ['pending'],
  upcoming: ['confirmed'],
  active: ['active'],
  completed: ['completed'],
  cancelled: ['cancelled', 'rejected'],
  all: [],
}

export default function ManagerBookingsPage() {
  const [tab, setTab] = useState('pending')
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [rejecting, setRejecting] = useState(null)
  const [ending, setEnding] = useState(null)
  const [managerCancelling, setManagerCancelling] = useState(null) // booking to cancel
  const [managerCancelReason, setManagerCancelReason] = useState('')
  const [managerCancelSubmitting, setManagerCancelSubmitting] = useState(false)
  const [reason, setReason] = useState('Dates not available')
  const [otherReason, setOtherReason] = useState('')
  const [odometerEnd, setOdometerEnd] = useState('')
  const [condition, setCondition] = useState('Perfect')
  const [notes, setNotes] = useState('')

  async function load() {
    setLoading(true)
    try {
      const params = { as_role: 'vehicle_manager' }
      if (TABS[tab].length) params.status = TABS[tab].join(',')
      const response = await api.get('/bookings/', { params })
      setBookings(response.data.bookings || [])
    } catch (err) {
      setBookings([])
      console.error('Failed to load bookings', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [tab])

  async function accept(id) {
    try { await api.patch(`/bookings/${id}/accept`); load() }
    catch (err) { toast.error(err.response?.data?.detail || 'Failed to accept booking') }
  }
  async function reject() {
    try {
      await api.patch(`/bookings/${rejecting.id}/reject`, { reason: reason === 'Other' ? otherReason : reason })
      setRejecting(null)
      load()
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to reject booking') }
  }
  async function start(id) {
    try { await api.patch(`/bookings/${id}/start-trip`, { odometer_start: 0 }); load() }
    catch (err) { toast.error(err.response?.data?.detail || 'Failed to start trip') }
  }
  async function endTrip() {
    try {
      await api.patch(`/bookings/${ending.id}/end-trip`, { odometer_end: Number(odometerEnd), condition_notes: `${condition}: ${notes}` })
      setEnding(null)
      setOdometerEnd('')
      load()
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to end trip') }
  }

  async function submitManagerCancel() {
    if (!managerCancelReason.trim()) { toast.error('Please enter a reason'); return }
    setManagerCancelSubmitting(true)
    try {
      const response = await api.post(`/bookings/${managerCancelling.id}/manager-cancel`, { reason: managerCancelReason.trim() })
      const data = response.data
      toast.success(data.message || 'Booking cancelled')
      setManagerCancelling(null)
      setManagerCancelReason('')
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to cancel booking')
    } finally {
      setManagerCancelSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8">
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-sm font-black uppercase text-sigfleet">Manager</p><h1 className="text-3xl font-black text-zinc-950">Bookings</h1></div>
          <Link to="/manager/trips/active" className="rounded-md bg-zinc-950 px-4 py-3 font-black text-white">Active Trips</Link>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">{Object.keys(TABS).map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-md px-4 py-2 font-black capitalize ${tab === item ? 'bg-sigfleet text-white' : 'bg-white text-zinc-700'}`}>{item === 'pending' ? 'Pending Requests' : item}</button>)}</div>
        {loading ? <div className="grid h-64 place-items-center"><Loader2 className="animate-spin text-sigfleet" /></div> : <div className="mt-5 grid gap-4">{bookings.map((booking) => <ManagerBookingCard key={booking.id} booking={booking} onAccept={accept} onReject={setRejecting} onStart={start} onEnd={setEnding} onManagerCancel={setManagerCancelling} />)}{!bookings.length && <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-12 text-center font-black text-zinc-500">No bookings in this view.</div>}</div>}
      </section>

      {/* Reject dialog */}
      <Dialog.Root open={Boolean(rejecting)} onOpenChange={(open) => !open && setRejecting(null)}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-5"><Dialog.Title className="text-xl font-black text-zinc-950">Reject request</Dialog.Title><select className="input mt-4 h-11" value={reason} onChange={(event) => setReason(event.target.value)}>{['Dates not available', 'Vehicle maintenance', 'Other'].map((item) => <option key={item}>{item}</option>)}</select>{reason === 'Other' && <textarea className="input mt-3 min-h-24" value={otherReason} onChange={(event) => setOtherReason(event.target.value)} placeholder="Reason" />}<button onClick={reject} className="mt-4 rounded-md bg-red-600 px-4 py-3 font-black text-white">Reject</button></Dialog.Content></Dialog.Portal>
      </Dialog.Root>

      {/* End trip dialog */}
      <Dialog.Root open={Boolean(ending)} onOpenChange={(open) => !open && setEnding(null)}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-5"><Dialog.Title className="text-xl font-black text-zinc-950">End trip</Dialog.Title><input className="input mt-4 h-11" type="number" value={odometerEnd} onChange={(event) => setOdometerEnd(event.target.value)} placeholder="Odometer end reading" /><div className="mt-3 grid grid-cols-3 gap-2">{['Perfect', 'Minor scratches', 'Damage'].map((item) => <button key={item} onClick={() => setCondition(item)} className={`rounded-md border px-3 py-2 text-sm font-black ${condition === item ? 'border-sigfleet bg-red-50 text-sigfleet' : 'border-zinc-200'}`}>{item}</button>)}</div><textarea className="input mt-3 min-h-24" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Condition notes" /><button onClick={endTrip} className="mt-4 rounded-md bg-sigfleet px-4 py-3 font-black text-white">Submit</button></Dialog.Content></Dialog.Portal>
      </Dialog.Root>

      {/* Manager cancel dialog — shows fine warning */}
      {managerCancelling && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <AlertTriangle className="text-amber-500 shrink-0" size={24} />
              <h3 className="text-xl font-black text-zinc-950">Cancel Booking</h3>
            </div>
            <p className="mt-2 text-sm font-bold text-zinc-500">
              {managerCancelling.car?.title} · {managerCancelling.booking_ref}
            </p>

            {/* Fine warning */}
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="font-black text-amber-800 text-sm">⚠ Manager Cancellation Fine</p>
              <p className="mt-1 text-sm font-bold text-amber-700">
                Cancelling a confirmed booking will:
              </p>
              <ul className="mt-2 space-y-1 text-sm font-bold text-amber-700 list-disc list-inside">
                <li>Refund 100% of the booking amount to the customer</li>
                <li>Charge you a fine: <strong>max(₹500, 10% of booking amount)</strong></li>
                <li>The fine is credited directly to the customer's wallet</li>
                <li>Your acceptance rate will be reduced by 5%</li>
              </ul>
              {Number(managerCancelling.total_amount) > 0 && (
                <p className="mt-3 font-black text-amber-900 text-sm">
                  Estimated fine: ₹{Math.max(500, Math.round(Number(managerCancelling.total_amount) * 0.10)).toLocaleString('en-IN')}
                </p>
              )}
            </div>

            <div className="mt-4">
              <label className="text-sm font-bold text-zinc-700">
                Reason for cancellation <span className="text-red-500">*</span>
              </label>
              <textarea
                className="input mt-1 min-h-20"
                value={managerCancelReason}
                onChange={(e) => setManagerCancelReason(e.target.value)}
                placeholder="Why are you cancelling this booking?"
              />
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => { setManagerCancelling(null); setManagerCancelReason('') }}
                className="rounded-md border border-zinc-200 px-4 py-2 font-black"
              >
                Keep Booking
              </button>
              <button
                onClick={submitManagerCancel}
                disabled={managerCancelSubmitting || !managerCancelReason.trim()}
                className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 font-black text-white disabled:opacity-60"
              >
                {managerCancelSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
                Cancel & Pay Fine
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export function ManagerBookingCard({ booking, onAccept, onReject, onStart, onEnd, onManagerCancel }) {
  const canStart = booking.status === 'confirmed' && Math.abs(new Date(booking.pickup_datetime) - Date.now()) <= 2 * 60 * 60 * 1000
  const canManagerCancel = ['pending', 'confirmed'].includes(booking.status)
  const expiresAt = useMemo(() => {
    const created = new Date(booking.created_at || booking.pickup_datetime)
    return Math.max(0, Math.ceil((created.getTime() + 24 * 60 * 60 * 1000 - Date.now()) / 3600000))
  }, [booking])
  return <article className={`rounded-lg border bg-white p-4 shadow-sm ${booking.status === 'pending' ? 'border-amber-300' : 'border-zinc-200'}`}><div className="grid gap-4 lg:grid-cols-[1fr_auto]"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black text-zinc-950">{booking.car?.title}</h2><span className={`rounded-full px-2 py-1 text-xs font-black capitalize ${statusClass(booking.status)}`}>{booking.status}</span>{booking.status === 'pending' && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">verified customer</span>}</div><p className="mt-2 font-bold text-zinc-500">Customer: {booking.counterparty?.name || 'Customer'}</p><p className="font-bold text-zinc-500">{formatDateTime(booking.pickup_datetime)} - {formatDateTime(booking.return_datetime)} · {bookingDuration(booking)}</p><p className="mt-2 text-lg font-black text-emerald-700">Manager earnings {moneyLabel(booking.manager_earnings)}</p>{booking.status === 'pending' && <p className="mt-1 flex items-center gap-1 text-sm font-bold text-amber-700"><Clock size={15} /> Expires in: {expiresAt} hours</p>}{booking.status === 'active' && <p className="mt-1 text-sm font-black text-blue-700">Trip in progress</p>}</div><div className="flex flex-wrap items-center gap-2">{booking.status === 'pending' && <><button onClick={() => onAccept(booking.id)} className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 font-black text-white"><CheckCircle2 size={17} /> Accept</button><button onClick={() => onReject(booking)} className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 font-black text-white"><XCircle size={17} /> Reject</button></>}{canStart && <button onClick={() => onStart(booking.id)} className="inline-flex items-center gap-2 rounded-md bg-zinc-950 px-4 py-2 font-black text-white"><Play size={17} /> Start Trip</button>}{booking.status === 'active' && <Link to={`/manager/inspect/${booking.id}`} className="inline-flex items-center gap-2 rounded-md bg-sigfleet px-4 py-2 font-black text-white"><Square size={17} /> Inspect & Close</Link>}{canManagerCancel && onManagerCancel && <button onClick={() => onManagerCancel(booking)} className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2 font-black text-red-700 hover:bg-red-100 transition" title="Cancel this booking (fine applies)"><XCircle size={17} /> Cancel Booking</button>}<Link to={`/dashboard/bookings/${booking.id}`} className="rounded-md border border-zinc-300 px-4 py-2 font-black text-zinc-800">Details</Link></div></div></article>
}
