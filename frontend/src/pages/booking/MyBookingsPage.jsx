import React, { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import { bookingDuration, formatDateTime, moneyLabel, statusClass } from '../../utils/bookingUtils'
import DashboardShell from '../user/DashboardShell'

const TABS = {
  upcoming: ['pending', 'confirmed'],
  active: ['active'],
  completed: ['completed'],
  cancelled: ['cancelled', 'rejected'],
}

export default function MyBookingsPage() {
  const [tab, setTab] = useState('upcoming')
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  async function load() {
    setLoading(true)
    const statuses = statusFilter || TABS[tab].join(',')
    const params = { as_role: 'customer', status: statuses }
    const response = await api.get('/bookings/', { params })
    setBookings(response.data.bookings || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [tab, statusFilter])
  const visible = useMemo(() => bookings.filter((booking) => !dateFilter || booking.pickup_datetime?.startsWith(dateFilter)), [bookings, dateFilter])

  async function cancel(id) {
    await api.post(`/bookings/${id}/cancel`, { reason: 'Cancelled by guest' })
    load()
  }

  return (
    <DashboardShell title="My Bookings" eyebrow="Trips">
      <section>
        <div className="mt-5 flex flex-wrap gap-2">{Object.keys(TABS).map((item) => <button key={item} onClick={() => { setTab(item); setStatusFilter('') }} className={`rounded-md px-4 py-2 font-black capitalize ${tab === item ? 'bg-sigfleet text-white' : 'bg-white text-zinc-700'}`}>{item}</button>)}</div>
        <div className="mt-4 flex flex-wrap gap-3"><input type="date" className="input h-11 w-48" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /><select className="input h-11 w-48" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Tab statuses</option>{['pending', 'confirmed', 'active', 'completed', 'cancelled', 'rejected'].map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
        {loading ? <div className="grid h-64 place-items-center"><Loader2 className="animate-spin text-sigfleet" /></div> : visible.length ? <div className="mt-5 grid gap-4">{visible.map((booking) => <BookingCard key={booking.id} booking={booking} onCancel={cancel} />)}</div> : <div className="mt-6 grid min-h-80 place-items-center rounded-lg border border-dashed border-zinc-300 bg-white text-center"><div><CalendarDays className="mx-auto text-sigfleet" size={42} /><h2 className="mt-3 text-2xl font-black text-zinc-950">No bookings yet</h2><Link to="/search" className="mt-4 inline-flex rounded-md bg-sigfleet px-4 py-3 font-black text-white">Explore cars</Link></div></div>}
      </section>
    </DashboardShell>
  )
}

function BookingCard({ booking, onCancel }) {
  return <article className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm lg:grid-cols-[140px_1fr_auto]"><img src={booking.car?.primary_image_url || 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=500&q=80'} alt="" className="h-28 w-full rounded-md object-cover lg:w-36" /><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black text-zinc-950">{booking.car?.title}</h2><span className={`rounded-full px-2 py-1 text-xs font-black capitalize ${statusClass(booking.status)}`}>{booking.status}</span></div><p className="mt-2 font-bold text-zinc-500">{formatDateTime(booking.pickup_datetime)} - {formatDateTime(booking.return_datetime)}</p><p className="mt-1 font-bold text-zinc-500">{bookingDuration(booking)} · {moneyLabel(booking.total_amount)}</p></div><div className="flex flex-wrap items-center gap-2"><Link to={`/dashboard/bookings/${booking.id}`} className="rounded-md bg-zinc-950 px-4 py-2 font-black text-white">View Details</Link>{['pending', 'confirmed'].includes(booking.status) && <button onClick={() => onCancel(booking.id)} className="rounded-md bg-red-50 px-4 py-2 font-black text-red-700">Cancel</button>}{booking.status === 'completed' && !booking.has_reviewed && <Link to={`/booking/review/${booking.id}`} className="rounded-md border border-zinc-300 px-4 py-2 font-black">Write Review</Link>}</div></article>
}
