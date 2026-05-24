import React, { useEffect, useMemo, useState } from 'react'
import DatePicker from 'react-datepicker'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Check, Loader2, ShieldCheck } from 'lucide-react'
import api from '../../services/api'
import { useAuthStore } from '../../context/AuthContext'
import { addHours, formatDuration, formatMoney } from '../../utils/searchData'
import { formatDateTime, priceLines } from '../../utils/bookingUtils'

const INSURANCE = [
  { key: 'basic', name: 'Basic', rate: '5%', bullets: ['Minor damage support', 'Standard liability'] },
  { key: 'standard', name: 'Standard', rate: '8%', bullets: ['Damage + theft', 'Better claim cover'] },
  { key: 'platinum', name: 'Platinum', rate: '12%', bullets: ['Full coverage', 'Roadside support'] },
]

export default function BookingConfirmPage() {
  const { carId } = useParams()
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const now = useMemo(() => new Date(), [])
  const [car, setCar] = useState(null)
  const [pickup, setPickup] = useState(new Date(params.get('pickup') || params.get('start_date') || location.state?.pickup_datetime || addHours(now, 24).toISOString()))
  const [returnAt, setReturnAt] = useState(new Date(params.get('return') || params.get('end_date') || location.state?.return_datetime || addHours(now, 52).toISOString()))
  const [insurance, setInsurance] = useState(params.get('insurance') || location.state?.insurance_plan || 'standard')
  const [coupon, setCoupon] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState('')
  const [guestNotes, setGuestNotes] = useState('')
  const [preview, setPreview] = useState(null)
  const [couponState, setCouponState] = useState('empty')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [unavailableDates, setUnavailableDates] = useState([])
  const [availability, setAvailability] = useState({ available: true, reason: 'Available' })
  const [policyOpen, setPolicyOpen] = useState(false)

  useEffect(() => {
    api.get(`/vehicles/${carId}`).then((response) => setCar(response.data)).finally(() => setLoading(false))
  }, [carId])

  useEffect(() => {
    if (!car) return
    async function loadPreview() {
      const response = await api.post('/bookings/preview', {
        car_id: carId,
        pickup_datetime: pickup.toISOString(),
        return_datetime: returnAt.toISOString(),
        insurance_plan: insurance,
        coupon_code: appliedCoupon || undefined,
      })
      setPreview(response.data)
      setCouponState(response.data.coupon_error ? 'invalid' : appliedCoupon ? 'applied' : 'empty')
    }
    loadPreview().catch((err) => setError(err.response?.data?.detail || 'Unable to preview booking.'))
  }, [appliedCoupon, car, carId, insurance, pickup, returnAt])

  useEffect(() => {
    if (!car) return
    api.get(`/vehicles/${carId}/unavailable-dates`, { params: { from_date: pickup.toISOString() } }).then((response) => {
      setUnavailableDates((response.data.unavailable_dates || []).map((item) => new Date(`${item}T00:00:00`)))
    }).catch(() => setUnavailableDates([]))
  }, [car, carId, pickup])

  useEffect(() => {
    if (!car) return
    const timer = window.setTimeout(() => {
      api.get(`/vehicles/${carId}/availability/check`, {
        params: { pickup_date: pickup.toISOString(), return_date: returnAt.toISOString(), insurance_plan: insurance },
      }).then((response) => {
        setAvailability(response.data)
        if (response.data.available && response.data.price_breakdown) setPreview({ price_breakdown: response.data.price_breakdown })
      }).catch((err) => setAvailability({ available: false, reason: err.response?.data?.detail || 'Unable to check availability' }))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [car, carId, insurance, pickup, returnAt])

  async function submit() {
    setSubmitting(true)
    setError('')
    try {
      const response = await api.post('/bookings/', {
        car_id: carId,
        pickup_datetime: pickup.toISOString(),
        return_datetime: returnAt.toISOString(),
        insurance_plan: insurance,
        coupon_code: appliedCoupon || undefined,
        guest_notes: guestNotes,
      })
      navigate(`/booking/pay/${response.data.booking_id}`, { state: response.data })
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to create booking.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-zinc-50"><Loader2 className="animate-spin text-sigfleet" /></main>
  if (!car) return null
  const breakdown = preview?.price_breakdown || {}
  const image = car.primary_image_url || car.images?.[0]?.image_url
  const kycOk = Boolean(user?.is_kyc_verified)

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8">
      <section className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <img src={image || 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80'} alt="" className="h-72 w-full object-cover" />
            <div className="p-5">
              <h1 className="text-3xl font-black text-zinc-950">{car.title}</h1>
              <p className="mt-2 font-bold text-zinc-500">{car.location_area}, {car.location_city}</p>
            </div>
          </div>
          <InfoBlock title="Trip Details">
            <div className="grid gap-3 sm:grid-cols-2">
              <DatePicker selected={pickup} onChange={(date) => { setPickup(date); if (returnAt < addHours(date, car.min_trip_hours || 4)) setReturnAt(addHours(date, car.min_trip_hours || 4)) }} showTimeSelect timeIntervals={30} excludeDates={unavailableDates} minDate={new Date()} dateFormat="dd MMM, h:mm aa" className="input h-11" />
              <DatePicker selected={returnAt} onChange={setReturnAt} showTimeSelect timeIntervals={30} excludeDates={unavailableDates} minDate={addHours(pickup, car.min_trip_hours || 4)} dateFormat="dd MMM, h:mm aa" className="input h-11" />
            </div>
            <Row label="Pickup" value={formatDateTime(pickup)} />
            <Row label="Return" value={formatDateTime(returnAt)} />
            <Row label="Total duration" value={breakdown.duration?.duration_label || formatDuration(pickup, returnAt)} />
            <Row label="Pickup location" value={car.location_address || `${car.location_area}, ${car.location_city}`} />
            <Link to={`/vehicles/${car.id}`} className="mt-3 inline-flex font-black text-sigfleet">Change dates</Link>
          </InfoBlock>
        </div>

        <aside className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-2xl font-black text-zinc-950">Booking Summary</h2>
          <h3 className="mt-5 text-sm font-black uppercase text-zinc-500">Insurance</h3>
          <div className="mt-2 grid gap-2">
            {INSURANCE.map((plan) => (
              <button key={plan.key} onClick={() => setInsurance(plan.key)} className={`rounded-md border p-3 text-left ${insurance === plan.key ? 'border-sigfleet bg-red-50' : 'border-zinc-200'}`}>
                <div className="flex justify-between"><span className="font-black text-zinc-950">{plan.name}</span><span className="font-black text-sigfleet">{plan.rate}</span></div>
                <ul className="mt-1 text-sm font-semibold text-zinc-500">{plan.bullets.map((item) => <li key={item}>• {item}</li>)}</ul>
              </button>
            ))}
          </div>
          <div className="mt-5 flex gap-2">
            <input className="input h-11" value={coupon} onChange={(event) => setCoupon(event.target.value)} placeholder="Coupon code" />
            <button onClick={() => setAppliedCoupon(coupon.trim())} className="rounded-md bg-zinc-950 px-4 font-black text-white">Apply</button>
          </div>
          {couponState === 'applied' && <p className="mt-2 flex items-center gap-1 text-sm font-bold text-emerald-700"><Check size={15} /> Coupon applied</p>}
          {couponState === 'invalid' && <p className="mt-2 text-sm font-bold text-red-700">{preview?.coupon_error}</p>}
          <div className="mt-5 space-y-2 border-t border-zinc-200 pt-4">
            {priceLines(breakdown).map(([label, value]) => <Row key={label} label={label} value={`${Number(value) < 0 ? '-' : ''}₹${formatMoney(Math.abs(Number(value)))}`} green={Number(value) < 0} />)}
            <div className="flex justify-between border-t border-zinc-200 pt-3 text-xl font-black text-zinc-950"><span>Total</span><span>₹{formatMoney(breakdown.total_amount)}</span></div>
            <p className="text-sm font-bold text-zinc-500">Security deposit: ₹{formatMoney(breakdown.security_deposit || car.security_deposit || 500)} refundable</p>
          </div>
          <textarea className="input mt-5 min-h-24" value={guestNotes} onChange={(event) => setGuestNotes(event.target.value)} placeholder="Any specific instructions for the manager?" />
          {!kycOk && <div className="mt-4 flex gap-2 rounded-md bg-amber-50 p-3 text-sm font-bold text-amber-800"><AlertTriangle size={18} /> Complete KYC before booking.</div>}
          {!availability.available && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{availability.reason}</p>}
          {error && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
          <button disabled={!kycOk || submitting || !availability.available} onClick={submit} className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-sigfleet px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:bg-zinc-300">
            {submitting && <Loader2 size={18} className="animate-spin" />} Confirm & Proceed
          </button>
          <button onClick={() => setPolicyOpen(!policyOpen)} className="mt-4 text-sm font-black text-zinc-700">Cancellation policy</button>
          {policyOpen && <p className="mt-2 text-sm leading-6 text-zinc-600">Guest cancellations get 90% refund before 48 hours, 50% refund between 24 and 48 hours, and no refund within 24 hours. Manager cancellations are fully refunded.</p>}
        </aside>
      </section>
    </main>
  )
}

function InfoBlock({ title, children }) {
  return <section className="rounded-lg border border-zinc-200 bg-white p-5"><h2 className="mb-4 flex items-center gap-2 text-xl font-black text-zinc-950"><ShieldCheck className="text-sigfleet" />{title}</h2>{children}</section>
}

function Row({ label, value, green }) {
  return <div className="flex justify-between gap-4 text-sm font-bold text-zinc-700"><span>{label}</span><span className={green ? 'text-emerald-700' : 'text-zinc-950'}>{value}</span></div>
}
