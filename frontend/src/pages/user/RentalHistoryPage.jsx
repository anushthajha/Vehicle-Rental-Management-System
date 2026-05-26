import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Copy } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import { bookingDuration, formatDateTime, moneyLabel, statusClass } from '../../utils/bookingUtils'
import DashboardShell from './DashboardShell'

const statuses = ['', 'pending', 'approved', 'active', 'completed', 'cancelled']

export default function RentalHistoryPage() {
  const [bookings, setBookings] = useState([])
  const [vehicleTypes, setVehicleTypes] = useState([])
  const [filters, setFilters] = useState({ status: '', from: '', to: '', vehicle_type_id: '', sort: 'newest' })
  const [page, setPage] = useState(1)

  useEffect(() => {
    api.get('/bookings/', { params: { as_role: 'customer', limit: 100 } }).then((response) => setBookings(response.data.bookings || [])).catch(() => setBookings([]))
    api.get('/vehicle-types').then((response) => setVehicleTypes(response.data.items || response.data.vehicle_types || response.data || [])).catch(() => setVehicleTypes([]))
  }, [])

  const filtered = useMemo(() => {
    return bookings
      .filter((booking) => !filters.status || booking.status === filters.status || (filters.status === 'approved' && booking.status === 'confirmed'))
      .filter((booking) => !filters.from || booking.pickup_datetime >= filters.from)
      .filter((booking) => !filters.to || booking.return_datetime <= filters.to)
      .filter((booking) => !filters.vehicle_type_id || booking.car?.vehicle_type_id === filters.vehicle_type_id)
      .sort((a, b) => filters.sort === 'newest' ? new Date(b.created_at || b.pickup_datetime) - new Date(a.created_at || a.pickup_datetime) : new Date(a.created_at || a.pickup_datetime) - new Date(b.created_at || b.pickup_datetime))
  }, [bookings, filters])

  const pages = Math.max(Math.ceil(filtered.length / 10), 1)
  const visible = filtered.slice((page - 1) * 10, page * 10)

  function update(key, value) {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
  }

  return (
    <DashboardShell title="My Rental History" eyebrow="History">

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-3xl font-black">My Rental History</h1><p className="mt-1 font-semibold text-zinc-500">All your past and present vehicle rentals</p></div>
        </div>
        <section className="mt-6 grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-5">
          <select className="input" value={filters.status} onChange={(event) => update('status', event.target.value)}>{statuses.map((status) => <option key={status || 'all'} value={status}>{status ? status[0].toUpperCase() + status.slice(1) : 'All'}</option>)}</select>
          <input type="date" className="input" value={filters.from} onChange={(event) => update('from', event.target.value)} />
          <input type="date" className="input" value={filters.to} onChange={(event) => update('to', event.target.value)} />
          <select className="input" value={filters.vehicle_type_id} onChange={(event) => update('vehicle_type_id', event.target.value)}><option value="">Vehicle type</option>{vehicleTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select>
          <select className="input" value={filters.sort} onChange={(event) => update('sort', event.target.value)}><option value="newest">Newest First</option><option value="oldest">Oldest First</option></select>
        </section>
        <section className="mt-6 grid gap-4">
          {visible.map((booking) => <HistoryCard key={booking.id} booking={booking} />)}
          {!visible.length && <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center font-black text-zinc-500">No rentals match these filters.</div>}
        </section>
        <div className="mt-6 flex flex-wrap justify-center gap-2">{Array.from({ length: pages }).map((_, index) => <button key={index} onClick={() => setPage(index + 1)} className={`h-10 w-10 rounded-md font-black ${page === index + 1 ? 'bg-[#E31837] text-white' : 'bg-white text-zinc-700'}`}>{index + 1}</button>)}</div>
    </DashboardShell>
  )
}

function HistoryCard({ booking }) {
  const copy = () => {
    navigator.clipboard?.writeText(booking.booking_ref || booking.id)
    toast.success('Rental IDerence copied')
  }
  return <article className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm lg:grid-cols-[96px_1fr_auto]"><img src={booking.car?.primary_image_url || 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=300&q=80'} alt="" className="h-20 w-20 rounded-md object-cover" /><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black">{booking.car?.title || 'Vehicle rental'}</h2><span className={`rounded-full px-2 py-1 text-xs font-black capitalize ${statusClass(booking.status)}`}>{booking.status}</span></div><p className="mt-1 font-bold text-zinc-500">{booking.car?.brand || booking.car?.make || 'Vehicle'} · {booking.car?.vehicle_type_name || booking.car?.category_name || 'Self-drive'}</p><button onClick={copy} className="mt-2 inline-flex items-center gap-2 text-sm font-black text-[#E31837]">Rental ID: {booking.booking_ref || booking.id} <Copy size={14} /></button><p className="mt-2 font-bold text-zinc-600">📅 {formatDateTime(booking.pickup_datetime)} → {formatDateTime(booking.return_datetime)} · {bookingDuration(booking)}</p><p className="mt-1 font-black">{moneyLabel(booking.total_amount)}</p></div><div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-stretch"><Link to={`/customer/bookings/${booking.id}`} className="rounded-md bg-zinc-950 px-4 py-2 text-center font-black text-white">View Details</Link>{['active', 'approved', 'confirmed'].includes(booking.status) && <Link to={`/customer/track/${booking.id}`} className="rounded-md bg-[#E31837] px-4 py-2 text-center font-black text-white">Track Status</Link>}{booking.status === 'completed' && !booking.has_reviewed && <Link to={`/booking/review/${booking.id}`} className="rounded-md border border-zinc-300 px-4 py-2 text-center font-black">Write Review</Link>}{booking.status === 'completed' && <Link to={`/booking/confirm/${booking.car?.id}`} className="rounded-md border border-zinc-300 px-4 py-2 text-center font-black">Book Again</Link>}</div></article>
}
