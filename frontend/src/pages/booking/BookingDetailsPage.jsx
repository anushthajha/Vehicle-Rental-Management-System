import React, { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import * as Dialog from '@radix-ui/react-dialog'
import { FileText, HelpCircle, Loader2, MessageSquare, Printer, X } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import api from '../../services/api'
import { bookingDuration, formatDateTime, moneyLabel, statusClass } from '../../utils/bookingUtils'

const STEPS = ['pending', 'confirmed', 'active', 'completed']

export default function BookingDetailsPage() {
  const { bookingId } = useParams()
  const [booking, setBooking] = useState(null)
  const [qr, setQr] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')

  async function load() {
    const response = await api.get(`/bookings/${bookingId}`)
    setBooking(response.data)
    setQr(await QRCode.toString(response.data.booking_ref, { type: 'svg', width: 128, margin: 1 }))
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
              <Info label="Host" value={`${booking.counterparty?.name || 'Host'}${confirmed && booking.counterparty?.phone ? ` · ${booking.counterparty.phone}` : ''}`} />
              <Info label="Pickup" value={formatDateTime(booking.pickup_datetime)} />
              <Info label="Return" value={formatDateTime(booking.return_datetime)} />
              <Info label="Duration" value={bookingDuration(booking)} />
              <Info label="Pickup location" value={confirmed ? booking.car?.location_address || booking.pickup_location : `${booking.car?.location_area}, ${booking.car?.location_city}`} />
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
            {booking.status === 'cancelled' && <Info label="Refund" value={`${moneyLabel(booking.refund_amount)} · ${booking.refund_status}`} />}
          </div>
        </section>

        <section className="flex flex-wrap gap-3 rounded-lg border border-zinc-200 bg-white p-5">
          {['pending', 'confirmed'].includes(booking.status) && <button onClick={() => setCancelOpen(true)} className="rounded-md bg-red-50 px-4 py-3 font-black text-red-700">Cancel Booking</button>}
          {booking.status === 'confirmed' && <button className="rounded-md border border-zinc-300 px-4 py-3 font-black text-zinc-800">Extend Trip request</button>}
          {booking.status === 'active' && <button className="rounded-md border border-zinc-300 px-4 py-3 font-black text-zinc-800">Extend Trip</button>}
          {booking.status === 'completed' && <button className="rounded-md bg-zinc-950 px-4 py-3 font-black text-white">{booking.has_reviewed ? 'View Review' : 'Write a Review'}</button>}
          <button className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-4 py-3 font-black text-zinc-800"><HelpCircle size={17} /> Contact Support</button>
          <button onClick={invoice} className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-4 py-3 font-black text-zinc-800"><Printer size={17} /> Download Invoice</button>
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
