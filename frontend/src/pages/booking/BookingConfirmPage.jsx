// FIX: Referenced outer block-scoped variable breakdown before initialization due to lexical order in submit(). Refactored to reference preview?.price_breakdown directly.

import React, { useEffect, useMemo, useState } from 'react'
import DatePicker from 'react-datepicker'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Check, Loader2, ShieldCheck, X } from 'lucide-react'
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
  const [withChauffeur, setWithChauffeur] = useState(false)
  const [coupon, setCoupon] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [availableCoupons, setAvailableCoupons] = useState([])
  const [couponsOpen, setCouponsOpen] = useState(false)
  const [couponMessage, setCouponMessage] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')
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
        vehicle_id: carId,
        pickup_datetime: pickup.toISOString(),
        return_datetime: returnAt.toISOString(),
        insurance_plan: insurance,
        coupon_code: appliedCoupon?.code || undefined,
        with_chauffeur: withChauffeur,
      })
      setPreview(response.data)
      setCouponState(response.data.coupon_error ? 'invalid' : appliedCoupon ? 'applied' : 'empty')
      if (response.data.coupon_error) setCouponMessage(response.data.coupon_error)
    }
    loadPreview().catch((err) => setError(err.response?.data?.detail || 'Unable to preview booking.'))
  }, [appliedCoupon, car, carId, insurance, pickup, returnAt, withChauffeur])

  useEffect(() => {
    api.get('/coupons').then((response) => setAvailableCoupons(response?.data?.items || response?.items || [])).catch(() => setAvailableCoupons([]))
  }, [])

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
      }).catch((err) => setAvailability({ available: false, reason: err.response?.data?.detail || 'Unable to check availability' }))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [car, carId, insurance, pickup, returnAt])

  async function submit() {
    setSubmitting(true)
    setError('')
    try {
      const response = await api.post('/bookings/', {
        vehicle_id: carId,
        pickup_datetime: pickup.toISOString(),
        return_datetime: returnAt.toISOString(),
        insurance_plan: insurance,
        coupon_code: appliedCoupon?.code || undefined,
        with_chauffeur: withChauffeur,
        customer_notes: customerNotes,
      })
      if (response.data.status === 'confirmed' || !response.data.requires_payment) {
        sessionStorage.setItem(
          'sigfleet_last_booking_success',
          JSON.stringify({
            id: response.data.booking_id,
            booking_ref: response.data.booking_ref,
            car: { title: response.data.vehicle_name, primary_image_url: response.data.car_primary_image },
            pickup_datetime: pickup.toISOString(),
            return_datetime: returnAt.toISOString(),
            total_amount: response.data.price_breakdown?.total_amount || preview?.price_breakdown?.total_amount || 0
          })
        )
        navigate(`/booking/success?ref=${response.data.booking_ref}`)
      } else {
        navigate(`/booking/pay/${response.data.booking_id}`, { state: response.data })
      }
    } catch (err) {
      const detail = err.response?.data?.detail
      if (detail === 'KYC approval required') {
        setError('Please complete KYC verification before booking.')
      } else {
        setError(typeof detail === 'string' ? detail : detail?.message || 'Unable to create booking.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-zinc-50"><Loader2 className="animate-spin text-sigfleet" /></main>
  if (!car) return null
  const breakdown = preview?.price_breakdown || {}
  const baseAmount = Number(breakdown.base_amount || 0)
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
          <h3 className="mt-5 text-sm font-black uppercase text-zinc-500">Rental Type</h3>
          <div className="mt-2 grid gap-2">
            {[
              [false, 'Self Drive', 'Drive the vehicle yourself.'],
              [true, 'With Chauffeur', '+₹800/day for a professional driver.'],
            ].map(([value, label, help]) => (
              <button key={label} type="button" onClick={() => setWithChauffeur(value)} className={`rounded-md border p-3 text-left ${withChauffeur === value ? 'border-sigfleet bg-red-50' : 'border-zinc-200'}`}>
                <div className="flex items-center gap-3">
                  <span className={`grid h-5 w-5 place-items-center rounded-full border ${withChauffeur === value ? 'border-sigfleet' : 'border-zinc-300'}`}>
                    {withChauffeur === value && <span className="h-2.5 w-2.5 rounded-full bg-sigfleet" />}
                  </span>
                  <div><p className="font-black text-zinc-950">{label}</p><p className="text-sm font-semibold text-zinc-500">{help}</p></div>
                </div>
              </button>
            ))}
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
            <input className="input h-11" value={coupon} onChange={(event) => setCoupon(event.target.value.toUpperCase())} placeholder="Coupon code" />
            <button onClick={() => applyCoupon(coupon)} className="rounded-md bg-zinc-950 px-4 font-black text-white">Apply</button>
          </div>
          <button type="button" onClick={() => setCouponsOpen((value) => !value)} className="mt-2 text-sm font-black text-sigfleet">View Available Coupons</button>
          {couponsOpen && <AvailableCoupons coupons={availableCoupons} bookingAmount={baseAmount} onApply={(code) => { setCoupon(code); applyCoupon(code); setCouponsOpen(false) }} />}
          {couponState === 'applied' && <p className="mt-2 flex items-center gap-1 text-sm font-bold text-emerald-700"><Check size={15} /> {appliedCoupon?.code} applied! You save ₹{formatMoney(appliedCoupon?.discount_amount || breakdown.coupon_discount || 0)} <button type="button" onClick={removeCoupon} className="ml-2 inline-flex items-center text-zinc-500"><X size={14} /> Remove</button></p>}
          {couponState === 'invalid' && <p className="mt-2 text-sm font-bold text-red-700">{couponMessage || preview?.coupon_error}</p>}
          <div className="mt-5 space-y-2 border-t border-zinc-200 pt-4">
            <Row label="Base rental" value={`₹${formatMoney(car.price_per_day)} × ${breakdown.duration?.days || Math.ceil((breakdown.duration_hours || 24) / 24) || 1} days = ₹${formatMoney(breakdown.base_amount)}`} />
            {Number(breakdown.chauffeur_fee || 0) > 0 && <Row label="Chauffeur fee" value={`₹800 × ${breakdown.duration?.days || Math.ceil((breakdown.duration_hours || 24) / 24) || 1} days = ₹${formatMoney(breakdown.chauffeur_fee)}`} />}
            {Number(breakdown.insurance_amount || 0) > 0 && <Row label="Insurance" value={`₹${formatMoney(breakdown.insurance_amount)}`} />}
            {Number(breakdown.discount_from_rules || 0) > 0 && <Row label="Rule discount" value={`-₹${formatMoney(breakdown.discount_from_rules)}`} green />}
            {Number(breakdown.coupon_discount || 0) > 0 && <Row label={`Coupon discount (${appliedCoupon?.code || breakdown.coupon_code || coupon} -5%)`} value={`-₹${formatMoney(breakdown.coupon_discount)}`} green />}
            {Number(breakdown.platform_fee || 0) > 0 && <Row label="Platform fee" value={`₹${formatMoney(breakdown.platform_fee)}`} />}
            <div className="flex justify-between border-t border-zinc-200 pt-3 text-xl font-black text-zinc-950"><span>Total</span><span>₹{formatMoney(breakdown.total_amount)}</span></div>
            <p className="text-sm font-bold text-zinc-500">Security deposit: ₹{formatMoney(breakdown.security_deposit || car.security_deposit || 500)} refundable</p>
          </div>
          <textarea className="input mt-5 min-h-24" value={customerNotes} onChange={(event) => setCustomerNotes(event.target.value)} placeholder="Any specific instructions for the manager?" />
          {!kycOk && <div className="mt-4 flex gap-2 rounded-md bg-amber-50 p-3 text-sm font-bold text-amber-800"><AlertTriangle size={18} /> <span>Please complete KYC verification before booking. <Link to="/customer/kyc" className="underline">Complete KYC</Link></span></div>}
          {!availability.available && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{availability.reason}</p>}
          {error && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
          <button disabled={!kycOk || submitting || !availability.available} onClick={submit} className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-sigfleet px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:bg-zinc-300">
            {submitting && <Loader2 size={18} className="animate-spin" />} Confirm & Proceed
          </button>
          <button onClick={() => setPolicyOpen(!policyOpen)} className="mt-4 text-sm font-black text-zinc-700">Cancellation policy</button>
          {policyOpen && <p className="mt-2 text-sm leading-6 text-zinc-600">Customer cancellations get 90% refund before 48 hours, 50% refund between 24 and 48 hours, and no refund within 24 hours. Manager cancellations are fully refunded.</p>}
        </aside>
      </section>
    </main>
  )

  async function applyCoupon(code) {
    const normalized = code.trim().toUpperCase()
    if (!normalized) return
    try {
      const response = await api.post('/coupons/validate', { code: normalized, booking_amount: baseAmount })
      const data = response.data
      if (data?.valid) {
        setAppliedCoupon({ code: normalized, discount_amount: data.discount_amount, discount_percent: data.discount_percent })
        setCouponState('applied')
        setCouponMessage(data.message)
      } else {
        setAppliedCoupon(null)
        setCouponState('invalid')
        setCouponMessage(data?.message || 'Invalid coupon')
      }
    } catch (err) {
      setAppliedCoupon(null)
      setCouponState('invalid')
      setCouponMessage(err.response?.data?.detail || err.message || 'Invalid coupon')
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null)
    setCoupon('')
    setCouponState('empty')
    setCouponMessage('')
  }
}

function AvailableCoupons({ coupons, bookingAmount, onApply }) {
  return (
    <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div className="space-y-2">
        {coupons.length ? coupons.map((item) => {
          const min = Number(item?.min_booking_amount || 0)
          const disabled = item?.already_used || bookingAmount < min
          const reason = item?.already_used ? 'Already used' : bookingAmount < min ? `Min booking ₹${formatMoney(min)} required` : ''
          return (
            <div key={item?.code} className={`rounded-md border bg-white p-3 ${disabled ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-zinc-950">{item?.code}</p>
                  <p className="text-sm font-bold text-zinc-600">{item?.description}</p>
                  <p className="mt-1 text-xs font-bold text-zinc-500">Min booking: ₹{formatMoney(min)} | Max discount: ₹{formatMoney(item?.max_discount)}</p>
                  {reason && <p className="mt-1 text-xs font-black text-red-700">{reason}</p>}
                </div>
                <button type="button" disabled={disabled} onClick={() => onApply(item?.code)} className="rounded-md bg-sigfleet px-3 py-2 text-xs font-black text-white disabled:bg-zinc-300">Apply</button>
              </div>
            </div>
          )
        }) : <p className="text-sm font-bold text-zinc-500">No active coupons available.</p>}
      </div>
    </div>
  )
}

function InfoBlock({ title, children }) {
  return <section className="rounded-lg border border-zinc-200 bg-white p-5"><h2 className="mb-4 flex items-center gap-2 text-xl font-black text-zinc-950"><ShieldCheck className="text-sigfleet" />{title}</h2>{children}</section>
}

function Row({ label, value, green }) {
  return <div className="flex justify-between gap-4 text-sm font-bold text-zinc-700"><span>{label}</span><span className={green ? 'text-emerald-700' : 'text-zinc-950'}>{value}</span></div>
}
