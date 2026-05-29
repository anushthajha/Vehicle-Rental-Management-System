import React, { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, ArrowLeft, HelpCircle, Loader2, Printer, Star, X } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../../services/api'
import { bookingDuration, formatDateTime, moneyLabel, statusClass } from '../../utils/bookingUtils'

const STEPS = ['pending', 'confirmed', 'active', 'completed']

export default function BookingDetailsPage() {
  const { bookingId } = useParams()
  const navigate = useNavigate()
  const [booking, setBooking] = useState(null)
  const [inspection, setInspection] = useState(null)
  const [reviews, setReviews] = useState([])
  const [qr, setQr] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')

  async function load() {
    const response = await api.get(`/bookings/${bookingId}`)
    setBooking(response.data)
    setQr(await QRCode.toString(response.data.booking_ref, { type: 'svg', width: 128, margin: 1 }))
    try {
      const inspectionResponse = await api.get(`/inspections/booking/${bookingId}`)
      setInspection(inspectionResponse.data?.inspection || inspectionResponse.data)
    } catch {
      setInspection(null)
    }
    try {
      const reviewsResponse = await api.get(`/reviews/booking/${bookingId}`)
      setReviews(reviewsResponse.data?.reviews || [])
    } catch {
      setReviews([])
    }
  }

  useEffect(() => { load() }, [bookingId])

  async function cancelBooking() {
    await api.post(`/bookings/${booking.id}/cancel`, { reason })
    setCancelOpen(false)
    setReason('')
    load()
  }

  function invoice() {
    const html = `<!doctype html><html><head><title>Invoice ${booking.booking_ref}</title><style>body{font-family:Arial;padding:32px;color:#111827}.brand{color:#e31837;font-size:28px;font-weight:900}.row{display:flex;justify-content:space-between;border-bottom:1px solid #e5e7eb;padding:10px 0}@media print{button{display:none}}</style></head><body><div class="brand">SigFleet</div><h1>Invoice ${booking.booking_ref}</h1><p>${booking.car.title}</p><div class="row"><span>Pickup</span><b>${formatDateTime(booking.pickup_datetime)}</b></div><div class="row"><span>Return</span><b>${formatDateTime(booking.return_datetime)}</b></div><div class="row"><span>Total</span><b>${moneyLabel(booking.total_amount)}</b></div><div class="row"><span>Payment</span><b>${booking.payment?.transaction_id || booking.payment?.status}</b></div><button onclick="print()">Print</button></body></html>`
    const tab = window.open('', '_blank')
    tab.document.write(html)
    tab.document.close()
  }

  if (!booking) return <main className="grid min-h-screen place-items-center bg-zinc-50"><Loader2 className="animate-spin text-sigfleet" /></main>
  const currentStep = Math.max(STEPS.indexOf(booking.status), 0)
  const confirmed = ['confirmed', 'active', 'completed'].includes(booking.status)

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8">
      <section className="mx-auto max-w-5xl space-y-5">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-black text-zinc-600 hover:bg-zinc-100 transition"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><p className="text-sm font-black uppercase text-sigfleet">Booking Details</p><h1 className="text-3xl font-black text-zinc-950">{booking.booking_ref}</h1></div>
            <span className={`rounded-full px-3 py-1 text-sm font-black capitalize ${statusClass(booking.status)}`}>{booking.status}</span>
          </div>
          <div className="mt-6 grid grid-cols-4 gap-2">
            {STEPS.map((step, index) => <div key={step} className={`rounded-full px-3 py-2 text-center text-xs font-black capitalize ${index < currentStep ? 'bg-emerald-100 text-emerald-700' : index === currentStep ? 'bg-red-100 text-sigfleet' : 'bg-zinc-100 text-zinc-500'}`}>{step}</div>)}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <section className="rounded-lg border border-zinc-200 bg-white p-5">
            <div className="flex gap-4">
              <img src={booking.car?.primary_image_url || 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=600&q=80'} alt="" className="h-28 w-40 rounded-md object-cover" />
              <div><h2 className="text-2xl font-black text-zinc-950">{booking.car?.title}</h2><p className="font-bold text-zinc-500">{confirmed ? booking.car?.registration_number : 'Registration shown after confirmation'}</p></div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Info label="Manager" value={`${booking.counterparty?.name || 'Manager'}${confirmed && booking.counterparty?.phone ? ` · ${booking.counterparty.phone}` : ''}`} />
              <Info label="Pickup" value={formatDateTime(booking.pickup_datetime)} />
              <Info label="Return" value={formatDateTime(booking.return_datetime)} />
              <Info label="Duration" value={bookingDuration(booking)} />
              <Info label="Pickup location" value={confirmed ? booking.car?.location_address || booking.pickup_location : `${booking.car?.location_area}, ${booking.car?.location_city}`} />
              <Info label="Rental type" value={booking.with_chauffeur ? 'With Chauffeur' : 'Self Drive'} />
              {booking.with_chauffeur && booking.drop_location && (
                <Info label="Drop location" value={booking.drop_location} />
              )}
              <Info label="Total paid" value={moneyLabel(booking.total_amount)} />
            </div>
          </section>
          <aside className="rounded-lg border border-zinc-200 bg-white p-5">
            <div className="mx-auto w-32" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="mt-3 text-center text-sm font-bold text-zinc-500">Scan booking ref</p>
          </aside>
        </div>

        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-xl font-black text-zinc-950">Payment Info</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Info label="Amount paid" value={moneyLabel(booking.payment?.amount || booking.total_amount)} />
            <Info label="Transaction" value={booking.payment?.transaction_id || booking.payment?.status || 'Pending'} />
            <Info label="Insurance" value={booking.insurance_plan} />
            <Info label="Chauffeur fee" value={booking.with_chauffeur ? moneyLabel(booking.chauffeur_fee) : 'Not selected'} />
            {booking.status === 'cancelled' && <Info label="Refund" value={`${moneyLabel(booking.refund_amount)} · ${booking.refund_status}`} />}
          </div>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-xl font-black text-zinc-950">Inspection Report</h2>
          {inspection ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Info label="Condition" value={inspection.condition?.replaceAll('_', ' ')} />
              <Info label="Penalty" value={Number(inspection.penalty_amount || 0) > 0 ? `${moneyLabel(inspection.penalty_amount)} · ${inspection.penalty_charged ? 'Charged' : 'Pending payment'}` : 'No penalty'} />
              <div className="rounded-md bg-zinc-50 p-3 sm:col-span-2">
                <p className="text-xs font-black uppercase text-zinc-500">Damage notes</p>
                <p className="mt-1 font-bold text-zinc-900">{inspection.damage_notes || 'No damage reported.'}</p>
              </div>
            </div>
          ) : booking.status === 'active' ? (
            <p className="mt-3 inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm font-black text-amber-800"><AlertTriangle size={16} /> Inspection pending after vehicle return.</p>
          ) : (
            <p className="mt-3 text-sm font-bold text-zinc-500">No inspection report recorded yet.</p>
          )}
        </section>

        {/* Reviews section — shown for completed bookings */}
        {booking.status === 'completed' && (
          <section className="rounded-lg border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-black text-zinc-950">Trip Reviews</h2>
              {!booking.has_reviewed && (
                <Link to={`/booking/review/${booking.id}`} className="inline-flex items-center gap-2 rounded-md bg-sigfleet px-4 py-2 text-sm font-black text-white">
                  <Star size={14} /> Write a Review
                </Link>
              )}
            </div>
            {reviews.length > 0 ? (
              <div className="mt-4 space-y-4">
                {reviews.map((review) => (
                  <ReviewItem key={review._id || review.id} review={review} />
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm font-bold text-zinc-500">
                No reviews yet for this trip.{' '}
                {!booking.has_reviewed && (
                  <Link to={`/booking/review/${booking.id}`} className="text-sigfleet underline">Be the first to review.</Link>
                )}
              </p>
            )}
          </section>
        )}

        <section className="flex flex-wrap gap-3 rounded-lg border border-zinc-200 bg-white p-5">
          {['pending', 'confirmed'].includes(booking.status) && <button onClick={() => setCancelOpen(true)} className="rounded-md bg-red-50 px-4 py-3 font-black text-red-700">Cancel Booking</button>}
          {booking.status === 'confirmed' && <button className="rounded-md border border-zinc-300 px-4 py-3 font-black text-zinc-800">Extend Trip request</button>}
          {booking.status === 'active' && <button className="rounded-md border border-zinc-300 px-4 py-3 font-black text-zinc-800">Extend Trip</button>}
          {booking.status === 'completed' && (
            booking.has_reviewed
              ? <Link to="/dashboard/reviews" className="rounded-md bg-zinc-950 px-4 py-3 font-black text-white inline-flex items-center gap-2"><Star size={16} /> View Review</Link>
              : <Link to={`/booking/review/${booking.id}`} className="rounded-md bg-zinc-950 px-4 py-3 font-black text-white inline-flex items-center gap-2"><Star size={16} /> Write a Review</Link>
          )}
          <Link
            to="/customer/support"
            className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-4 py-3 font-black text-zinc-800 hover:bg-zinc-50 transition"
          >
            <HelpCircle size={17} /> Contact Support
          </Link>
          <button
            onClick={invoice}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-4 py-3 font-black text-zinc-800 hover:bg-zinc-50 transition"
          >
            <Printer size={17} /> Download Invoice
          </button>
        </section>
      </section>

      <Dialog.Root open={cancelOpen} onOpenChange={setCancelOpen}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-5"><Dialog.Title className="text-xl font-black text-zinc-950">Cancel booking</Dialog.Title><button onClick={() => setCancelOpen(false)} className="absolute right-3 top-3"><X /></button><textarea className="input mt-4 min-h-24" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason" /><button onClick={cancelBooking} className="mt-4 rounded-md bg-red-600 px-4 py-3 font-black text-white">Cancel Booking</button></Dialog.Content></Dialog.Portal>
      </Dialog.Root>
    </main>
  )
}

function Info({ label, value }) {
  return <div className="rounded-md bg-zinc-50 p-3"><p className="text-xs font-black uppercase text-zinc-500">{label}</p><p className="mt-1 font-bold text-zinc-900">{value || '-'}</p></div>
}

const REVIEW_TYPE_LABELS = {
  customer_to_vehicle: 'Vehicle Review',
  customer_to_manager: 'Manager Review',
  manager_to_customer: 'Customer Review',
}

function ReviewItem({ review }) {
  const name = review.reviewer_name || 'SigFleet User'
  const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
  const typeLabel = REVIEW_TYPE_LABELS[review.review_type] || 'Review'
  return (
    <article className="rounded-lg border border-zinc-100 bg-zinc-50 p-4">
      <div className="flex items-start gap-3">
        {review.reviewer_photo
          ? <img src={review.reviewer_photo} alt={name} className="h-9 w-9 rounded-full object-cover" />
          : <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-200 text-xs font-black text-zinc-700">{initials}</div>
        }
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-black text-zinc-950">{name}</span>
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-black text-sigfleet">{typeLabel}</span>
          </div>
          <div className="mt-1 flex gap-0.5">
            {[1,2,3,4,5].map((s) => <Star key={s} size={13} className={s <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-300'} />)}
          </div>
        </div>
        <span className="text-xs font-bold text-zinc-400 shrink-0">
          {review.created_at ? new Date(review.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : ''}
        </span>
      </div>
      {review.title && <p className="mt-3 font-black text-zinc-900">{review.title}</p>}
      <p className="mt-2 text-sm font-medium leading-relaxed text-zinc-700">{review.body}</p>
      {review.manager_reply && (
        <div className="mt-3 border-l-4 border-sigfleet bg-white px-3 py-2 rounded-r-md">
          <p className="text-xs font-black text-zinc-500">Manager replied</p>
          <p className="mt-1 text-sm font-medium text-zinc-700">{review.manager_reply}</p>
        </div>
      )}
    </article>
  )
}
