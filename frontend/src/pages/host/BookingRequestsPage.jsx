import React, { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { CheckCircle2, Clock, Loader2, Play, Square, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
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

export default function BookingRequestsPage() {
  const [tab, setTab] = useState('pending')
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [rejecting, setRejecting] = useState(null)
  const [ending, setEnding] = useState(null)
  const [reason, setReason] = useState('Dates not available')
  const [otherReason, setOtherReason] = useState('')
  const [odometerEnd, setOdometerEnd] = useState('')
  const [condition, setCondition] = useState('Perfect')
  const [notes, setNotes] = useState('')

  async function load() {
    setLoading(true)
    const params = { as_role: 'host' }
    if (TABS[tab].length) params.status = TABS[tab].join(',')
    const response = await api.get('/bookings/', { params })
    setBookings(response.data.bookings || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [tab])

  async function accept(id) { await api.patch(`/bookings/${id}/accept`); load() }
  async function reject() {
    await api.patch(`/bookings/${rejecting.id}/reject`, { reason: reason === 'Other' ? otherReason : reason })
    setRejecting(null)
    load()
  }
  async function start(id) { await api.patch(`/bookings/${id}/start-trip`, { odometer_start: 0 }); load() }
  async function endTrip() {
    await api.patch(`/bookings/${ending.id}/end-trip`, { odometer_end: Number(odometerEnd), condition_notes: `${condition}: ${notes}` })
    setEnding(null)
    setOdometerEnd('')
    load()
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8">
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-sm font-black uppercase text-zoomcar">Host</p><h1 className="text-3xl font-black text-zinc-950">Bookings</h1></div>
          <Link to="/host/active-trips" className="rounded-md bg-zinc-950 px-4 py-3 font-black text-white">Active Trips</Link>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">{Object.keys(TABS).map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-md px-4 py-2 font-black capitalize ${tab === item ? 'bg-zoomcar text-white' : 'bg-white text-zinc-700'}`}>{item === 'pending' ? 'Pending Requests' : item}</button>)}</div>
        {loading ? <div className="grid h-64 place-items-center"><Loader2 className="animate-spin text-zoomcar" /></div> : <div className="mt-5 grid gap-4">{bookings.map((booking) => <HostBookingCard key={booking.id} booking={booking} onAccept={accept} onReject={setRejecting} onStart={start} onEnd={setEnding} />)}{!bookings.length && <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-12 text-center font-black text-zinc-500">No bookings in this view.</div>}</div>}
      </section>

      <Dialog.Root open={Boolean(rejecting)} onOpenChange={(open) => !open && setRejecting(null)}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-5"><Dialog.Title className="text-xl font-black text-zinc-950">Reject request</Dialog.Title><select className="input mt-4 h-11" value={reason} onChange={(event) => setReason(event.target.value)}>{['Dates not available', 'Car maintenance', 'Other'].map((item) => <option key={item}>{item}</option>)}</select>{reason === 'Other' && <textarea className="input mt-3 min-h-24" value={otherReason} onChange={(event) => setOtherReason(event.target.value)} placeholder="Reason" />}<button onClick={reject} className="mt-4 rounded-md bg-red-600 px-4 py-3 font-black text-white">Reject</button></Dialog.Content></Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={Boolean(ending)} onOpenChange={(open) => !open && setEnding(null)}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-5"><Dialog.Title className="text-xl font-black text-zinc-950">End trip</Dialog.Title><input className="input mt-4 h-11" type="number" value={odometerEnd} onChange={(event) => setOdometerEnd(event.target.value)} placeholder="Odometer end reading" /><div className="mt-3 grid grid-cols-3 gap-2">{['Perfect', 'Minor scratches', 'Damage'].map((item) => <button key={item} onClick={() => setCondition(item)} className={`rounded-md border px-3 py-2 text-sm font-black ${condition === item ? 'border-zoomcar bg-red-50 text-zoomcar' : 'border-zinc-200'}`}>{item}</button>)}</div><textarea className="input mt-3 min-h-24" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Condition notes" /><button onClick={endTrip} className="mt-4 rounded-md bg-zoomcar px-4 py-3 font-black text-white">Submit</button></Dialog.Content></Dialog.Portal>
      </Dialog.Root>
    </main>
  )
}

export function HostBookingCard({ booking, onAccept, onReject, onStart, onEnd }) {
  const canStart = booking.status === 'confirmed' && Math.abs(new Date(booking.pickup_datetime) - Date.now()) <= 2 * 60 * 60 * 1000
  const expiresAt = useMemo(() => {
    const created = new Date(booking.created_at || booking.pickup_datetime)
    return Math.max(0, Math.ceil((created.getTime() + 24 * 60 * 60 * 1000 - Date.now()) / 3600000))
  }, [booking])
  return <article className={`rounded-lg border bg-white p-4 shadow-sm ${booking.status === 'pending' ? 'border-amber-300' : 'border-zinc-200'}`}><div className="grid gap-4 lg:grid-cols-[1fr_auto]"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black text-zinc-950">{booking.car?.title}</h2><span className={`rounded-full px-2 py-1 text-xs font-black capitalize ${statusClass(booking.status)}`}>{booking.status}</span>{booking.status === 'pending' && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">verified guest</span>}</div><p className="mt-2 font-bold text-zinc-500">Guest: {booking.counterparty?.name || 'Guest'}</p><p className="font-bold text-zinc-500">{formatDateTime(booking.pickup_datetime)} - {formatDateTime(booking.return_datetime)} · {bookingDuration(booking)}</p><p className="mt-2 text-lg font-black text-emerald-700">Host earnings {moneyLabel(booking.host_earnings)}</p>{booking.status === 'pending' && <p className="mt-1 flex items-center gap-1 text-sm font-bold text-amber-700"><Clock size={15} /> Expires in: {expiresAt} hours</p>}{booking.status === 'active' && <p className="mt-1 text-sm font-black text-blue-700">Trip in progress</p>}</div><div className="flex flex-wrap items-center gap-2">{booking.status === 'pending' && <><button onClick={() => onAccept(booking.id)} className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 font-black text-white"><CheckCircle2 size={17} /> Accept</button><button onClick={() => onReject(booking)} className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 font-black text-white"><XCircle size={17} /> Reject</button></>}{canStart && <button onClick={() => onStart(booking.id)} className="inline-flex items-center gap-2 rounded-md bg-zinc-950 px-4 py-2 font-black text-white"><Play size={17} /> Start Trip</button>}{booking.status === 'active' && <button onClick={() => onEnd(booking)} className="inline-flex items-center gap-2 rounded-md bg-zoomcar px-4 py-2 font-black text-white"><Square size={17} /> End Trip</button>}<Link to={`/dashboard/bookings/${booking.id}`} className="rounded-md border border-zinc-300 px-4 py-2 font-black text-zinc-800">Details</Link></div></div></article>
}
