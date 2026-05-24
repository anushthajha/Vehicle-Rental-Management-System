import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Copy, CreditCard, LifeBuoy, Phone } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import api from '../../services/api'
import { bookingDuration, formatDateTime, moneyLabel } from '../../utils/bookingUtils'
import { CustomerTopNav } from './DashboardPage'

export default function TrackRentalPage() {
  const { bookingId } = useParams()
  const [booking, setBooking] = useState(null)

  useEffect(() => {
    const id = bookingId === 'latest' ? '' : bookingId
    const request = id ? api.get(`/bookings/${id}`) : api.get('/bookings/', { params: { as_role: 'customer', limit: 1 } })
    request.then((response) => setBooking(response.data.booking || response.data.bookings?.[0] || response.data)).catch(() => setBooking(null))
  }, [bookingId])

  const steps = useMemo(() => buildSteps(booking), [booking])

  return (
    <main className="min-h-screen bg-[#F7F7F8] text-zinc-950">
      <CustomerTopNav />
      <div className="mx-auto max-w-6xl px-4 py-8">
        {!booking ? <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center font-black text-zinc-500">No tracked rental found.</div> : (
          <div className="space-y-6">
            <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
              <button onClick={() => { navigator.clipboard?.writeText(booking.booking_ref); toast.success('Rental IDerence copied') }} className="inline-flex items-center gap-2 text-sm font-black text-[#E31837]">Rental ID: {booking.booking_ref || booking.id} <Copy size={15} /></button>
              <div className="mt-4 flex flex-wrap items-center gap-4"><img src={booking.car?.primary_image_url || 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=300&q=80'} alt="" className="h-20 w-28 rounded-md object-cover" /><div><h1 className="text-3xl font-black">{booking.car?.title || 'Vehicle rental'}</h1><p className="font-bold text-zinc-500">Manager: {booking.counterparty?.name || booking.manager_name || 'Assigned manager'}</p></div><img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(booking.counterparty?.name || 'Manager')}`} alt="" className="h-12 w-12 rounded-full" /></div>
            </section>
            <section className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
              <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-black">Status Timeline</h2><div className="mt-6 space-y-6">{steps.map((step, index) => <TimelineStep key={step.title} step={step} isLast={index === steps.length - 1} />)}</div></div>
              <div className="space-y-6"><TripDetails booking={booking} />{booking.status === 'active' && <Emergency booking={booking} />}</div>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}

function buildSteps(booking) {
  if (!booking) return []
  const approved = ['confirmed', 'approved', 'active', 'completed'].includes(booking.status)
  const paid = booking.payment_status === 'paid' || approved
  return [
    { icon: '🔵', title: 'Booking Submitted', done: true, text: 'Your rental request has been sent to the vehicle manager.', time: booking.created_at },
    { icon: approved ? '✅' : booking.status === 'rejected' ? '❌' : '⏳', title: 'Manager Review', done: approved, text: approved ? `Approved by ${booking.counterparty?.name || 'manager'}` : booking.status === 'rejected' ? `Rejected by manager. ${booking.rejection_reason || ''}` : 'Awaiting manager approval', time: booking.approved_at },
    { icon: paid ? '✅' : '💳', title: 'Payment', done: paid, text: paid ? `Payment of ${moneyLabel(booking.total_amount)} confirmed` : 'Complete payment to confirm your booking', cta: !paid && `/booking/pay/${booking.id}` },
    { icon: booking.status === 'active' || booking.status === 'completed' ? '✅' : '🚗', title: 'Trip Active', done: ['active', 'completed'].includes(booking.status), text: booking.status === 'active' ? `Trip started. Return by ${formatDateTime(booking.return_datetime)}` : 'Trip has not started yet.', time: booking.actual_pickup_time },
    { icon: booking.status === 'completed' ? '✅' : '🏁', title: 'Trip Completed', done: booking.status === 'completed', text: booking.status === 'completed' ? 'Trip completed.' : 'Completion will appear here after return.', time: booking.actual_return_time, cta: booking.status === 'completed' && !booking.has_reviewed && `/booking/review/${booking.id}` },
  ]
}

function TimelineStep({ step, isLast }) {
  return <div className="relative grid grid-cols-[36px_1fr] gap-4">{!isLast && <span className="absolute left-[17px] top-9 h-full w-0.5 bg-zinc-200" />}<div className={`z-10 grid h-9 w-9 place-items-center rounded-full ${step.done ? 'bg-emerald-50' : 'bg-zinc-100'}`}>{step.icon}</div><div><h3 className="font-black">{step.title}</h3><p className="mt-1 font-semibold text-zinc-600">{step.text}</p>{step.time && <p className="mt-1 text-sm font-bold text-zinc-500">{formatDateTime(step.time)}</p>}{step.cta && <Link to={step.cta} className="mt-3 inline-flex rounded-md bg-[#E31837] px-4 py-2 font-black text-white">{step.title === 'Payment' ? 'Pay Now' : 'Write a Review'}</Link>}</div></div>
}

function TripDetails({ booking }) {
  return <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-black">Trip Details</h2><div className="mt-4 space-y-3 font-bold text-zinc-600"><p>Vehicle: {booking.car?.title}</p><p>Dates: {formatDateTime(booking.pickup_datetime)} → {formatDateTime(booking.return_datetime)} · {bookingDuration(booking)}</p><p>Pickup: {booking.pickup_location || booking.car?.location_area || booking.car?.location_city || '-'}</p><p className="text-zinc-950">Total paid: {moneyLabel(booking.total_amount)}</p><p className="text-sm">Breakdown: rental {moneyLabel(booking.base_amount || booking.total_amount)} · fees {moneyLabel(booking.platform_fee || 0)} · deposit {moneyLabel(booking.security_deposit || 0)}</p></div></section>
}

function Emergency({ booking }) {
  return <section className="rounded-lg border border-red-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-black text-[#E31837]">Emergency Contact</h2><p className="mt-3 flex items-center gap-2 font-black"><Phone size={18} /> {booking.counterparty?.phone || 'Manager phone available during active rental'}</p><Link to={`/customer/support?booking_ref=${booking.booking_ref}`} className="mt-4 inline-flex items-center gap-2 rounded-md bg-zinc-950 px-4 py-3 font-black text-white"><LifeBuoy size={18} /> Contact Support</Link></section>
}
