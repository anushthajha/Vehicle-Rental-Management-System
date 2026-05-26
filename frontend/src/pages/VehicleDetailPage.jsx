// FIX: handleRentNowTrigger was calling navigate() and reading location without importing or initializing them in the parent component, causing a crash. Added useNavigate, useLocation, and useAuthStore loading guards.

import React, { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import DatePicker from 'react-datepicker'
import ImageGallery from 'react-image-gallery'
import { DivIcon } from 'leaflet'
import { MapContainer, Marker, Circle, TileLayer } from 'react-leaflet'
import { AlertTriangle, Check, Copy, Heart, Loader2, MapPin, ShieldCheck, Star, X } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import toast from 'react-hot-toast'
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom'
import api from '../services/api'
import VehicleCard from '../components/vehicle/VehicleCard'
import { useAuthStore } from '../context/AuthContext'
import { addHours, dateRangeLabel, formatDuration, formatMoney } from '../utils/searchData'
import { isLocallySaved, removeLocalWishlistCar, saveLocalWishlistCar } from '../utils/wishlist'
import DashboardShell from './user/DashboardShell'

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1600&q=80'
const INSURANCE = [
  { key: 'basic', label: 'Basic', rate: 0.05, text: 'Covers minor damage' },
  { key: 'standard', label: 'Standard', rate: 0.08, text: 'Covers damage + theft' },
  { key: 'platinum', label: 'Platinum', rate: 0.12, text: 'Full coverage + roadside' },
]

export default function VehicleDetailPage() {
  const { carId } = useParams()
  const { user, isLoading } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [car, setCar] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sticky, setSticky] = useState(false)
  const [activeImage, setActiveImage] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [reviews, setReviews] = useState(null)
  const [reviewFilter, setReviewFilter] = useState('')
  const [reviewPage, setReviewPage] = useState(1)
  const [similar, setSimilar] = useState([])
  const isRestrictedRole = user && (user.role === 'vehicle_manager' || user.role === 'admin')
  const handleRentNowTrigger = () => {
    if (!isLoading && !user) {
      navigate('/auth/login', { state: { from: location.pathname + location.search } })
      return
    }
    setBookingOpen(true)
  }

  useEffect(() => {
    async function loadDetail() {
      setLoading(true)
      setError('')
      try {
        const response = await api.get(`/vehicles/${carId}`)
        setCar(response.data)
      } catch {
        setError('The car details could not be loaded. Please try again.')
      } finally {
        setLoading(false)
      }
    }
    loadDetail()
  }, [carId])

  useEffect(() => {
    function onScroll() {
      setSticky(window.scrollY > window.innerHeight * 0.55)
    }
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!car) return
    api.get(`/reviews/car/${car.id}`, { params: { page: 1, limit: 5, rating: reviewFilter || undefined } }).then((response) => {
      setReviews(response.data)
      setReviewPage(1)
    })
    api.get('/vehicles/', { params: { city: car.location_city, category_id: car.category_id, exclude: car.id, limit: 4 } }).then((response) => setSimilar(response.data.vehicles || []))
  }, [car, reviewFilter])

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-zinc-50"><Loader2 className="animate-spin text-sigfleet" /></main>
  }
  if (error) return <DetailError message={error} onRetry={() => window.location.reload()} />
  if (!car) return null

  const images = car.images?.length ? car.images : [{ image_url: car.primary_image_url || FALLBACK_IMAGE, thumb_url: car.primary_image_url || FALLBACK_IMAGE }]
  const galleryItems = images.map((image) => ({ original: image.image_url, thumbnail: image.thumb_url || image.image_url }))
  const primaryImage = images[0]?.image_url || FALLBACK_IMAGE

  async function loadMoreReviews() {
    const nextPage = reviewPage + 1
    const response = await api.get(`/reviews/car/${car.id}`, { params: { page: nextPage, limit: 5, rating: reviewFilter || undefined } })
    setReviews((current) => ({ ...response.data, reviews: [...(current?.reviews || []), ...(response.data.reviews || [])] }))
    setReviewPage(nextPage)
  }

  const detailMarkup = (
    <>
      {sticky && (
        <div className="fixed inset-x-0 top-0 z-40 border-b border-zinc-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate font-black text-zinc-950">{car.title}</p>
              <p className="text-sm font-bold text-zinc-500">₹{formatMoney(car.price_per_day)}/day</p>
            </div>
            {!isRestrictedRole && <button onClick={handleRentNowTrigger} className="rounded-md bg-sigfleet px-4 py-2 font-black text-white">Rent Now</button>}
          </div>
        </div>
      )}

      <HeroGallery images={images} activeImage={activeImage} setActiveImage={setActiveImage} onOpen={() => setLightboxOpen(true)} />

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 space-y-8">
          <CarHeader car={car} />
          <FeaturesGrid car={car} />
          <Description text={car.description} />
          <AvailabilityCalendar carId={car.id} onPickRange={() => {}} />
          <ManagerSection car={car} />
          <ReviewsSection data={reviews} filter={reviewFilter} setFilter={setReviewFilter} onMore={loadMoreReviews} />
          <LocationMap car={car} />
          <SimilarCars vehicles={similar} />
        </section>

        <div className="hidden lg:block">
          <div className="sticky top-20">
            <BookingWidget car={car} user={user} />
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white p-3 shadow-2xl lg:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div>
            <p className="text-xl font-black text-zinc-950">₹{formatMoney(car.price_per_day)}<span className="text-sm font-bold text-zinc-500">/day</span></p>
            <p className="text-xs font-bold text-zinc-500">Free cancellation before pickup</p>
          </div>
          {isRestrictedRole ? (
            <div className="rounded-md bg-red-50 px-3 py-2 text-xs font-bold text-red-700">Only customers can rent vehicles.</div>
          ) : (
            <button onClick={handleRentNowTrigger} className="rounded-md bg-sigfleet px-5 py-3 font-black text-white">Rent Now</button>
          )}
        </div>
      </div>

      <Dialog.Root open={bookingOpen} onOpenChange={setBookingOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[94vh] overflow-y-auto rounded-t-2xl bg-white p-4 lg:hidden">
            <Dialog.Title className="sr-only">Booking</Dialog.Title>
            <button onClick={() => setBookingOpen(false)} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-zinc-100"><X size={18} /></button>
            <BookingWidget car={car} user={user} borderless />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/90" />
          <Dialog.Content className="fixed inset-4 z-50">
            <Dialog.Title className="sr-only">Vehicle photos</Dialog.Title>
            <button onClick={() => setLightboxOpen(false)} className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-white text-zinc-950"><X size={20} /></button>
            <ImageGallery items={galleryItems} startIndex={activeImage} showFullscreenButton={false} showPlayButton={false} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )

  if (user?.role === 'customer') {
    return (
      <DashboardShell title={car.title} eyebrow="Vehicle Details">
        <Helmet>
          <title>{`${car.title} ${car.year || ''} — ₹${formatMoney(car.price_per_day)}/day | SigFleet`}</title>
          <meta name="description" content={`Book ${car.title} in ${car.location_city} from ₹${formatMoney(car.price_per_day)} per day.`} />
          <meta property="og:image" content={primaryImage} />
          <meta property="og:title" content={`${car.title} — ₹${formatMoney(car.price_per_day)}/day`} />
        </Helmet>
        {detailMarkup}
      </DashboardShell>
    )
  }

  return (
    <main id="main-content" className="min-h-screen bg-zinc-50 pb-28 lg:pb-0">
      <Helmet>
        <title>{`${car.title} ${car.year || ''} — ₹${formatMoney(car.price_per_day)}/day | SigFleet`}</title>
        <meta name="description" content={`Book ${car.title} in ${car.location_city} from ₹${formatMoney(car.price_per_day)} per day.`} />
        <meta property="og:image" content={primaryImage} />
        <meta property="og:title" content={`${car.title} — ₹${formatMoney(car.price_per_day)}/day`} />
      </Helmet>
      {detailMarkup}
    </main>
  )
}

function HeroGallery({ images, activeImage, setActiveImage, onOpen }) {
  return (
    <section className="bg-zinc-950">
      <button onClick={onOpen} className="relative block h-[60vh] w-full overflow-hidden text-left">
        <img src={images[activeImage]?.image_url || FALLBACK_IMAGE} alt="Selected car gallery view" loading="eager" decoding="async" width="1600" height="900" className="h-full w-full object-cover" />
        <span className="absolute bottom-4 right-4 rounded-full bg-black/70 px-4 py-2 text-sm font-black text-white">{images.length} photos</span>
      </button>
      <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3">
        {images.map((image, index) => (
          <button key={image.id || index} onClick={() => setActiveImage(index)} className={`h-20 w-32 shrink-0 overflow-hidden rounded-md border-2 ${index === activeImage ? 'border-sigfleet' : 'border-transparent'}`}>
            <img src={image.thumb_url || image.image_url} alt={`Vehicle gallery thumbnail ${index + 1}`} loading="lazy" decoding="async" width="160" height="100" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </section>
  )
}

function CarHeader({ car }) {
  const [saved, setSaved] = useState(isLocallySaved(car.id))
  const { user } = useAuthStore()
  const navigate = useNavigate()

  async function toggle() {
    if (!user) {
      navigate('/auth/login', { state: { from: window.location.pathname + window.location.search } })
      return
    }
    const next = !saved
    setSaved(next)
    if (next) await api.post('/wishlist/', { vehicle_id: car.id })
    else await api.delete(`/wishlist/${car.id}`)
  }

  async function share() {
    await navigator.clipboard?.writeText(window.location.href)
    toast.success('Link copied to clipboard')
  }

  return (
    <header className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-zinc-950">{car.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            {[car.category_name || car.category, car.vehicle_type_name || car.vehicle_type, car.transmission, car.fuel_type].filter(Boolean).map((item) => <span key={item} className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-black uppercase text-zinc-700">{item}</span>)}
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm font-bold text-zinc-600">
            <Star className="fill-amber-400 text-amber-400" size={16} /> {Number(car.average_rating || 0).toFixed(1)} · {car.total_trips} trips · {car.location_city}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={share} className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-4 py-2 font-black text-zinc-800"><Copy size={17} /> Share</button>
          <button onClick={toggle} className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 font-black ${saved ? 'border-red-200 text-sigfleet' : 'border-zinc-300 text-zinc-800'}`}><Heart size={17} fill={saved ? 'currentColor' : 'none'} /> Wishlist</button>
        </div>
      </div>
    </header>
  )
}

function BookingWidget({ car, user, borderless = false }) {
  const [pickup, setPickup] = useState(addHours(new Date(), 24))
  const [returnAt, setReturnAt] = useState(addHours(new Date(), 52))
  const [insurance, setInsurance] = useState('standard')
  const [coupon, setCoupon] = useState('')
  const [couponState, setCouponState] = useState(null)
  const [expanded, setExpanded] = useState(true)
  const [unavailableDates, setUnavailableDates] = useState([])
  const [availability, setAvailability] = useState({ available: true, reason: 'Available', price_breakdown: {} })
  const price = availability.price_breakdown || {}
  const navigate = useNavigate()
  const isRestrictedRole = user && (user.role === 'vehicle_manager' || user.role === 'admin')

  const handleRentClick = () => {
    if (!user) {
      const returnUrl = `${window.location.pathname}?pickup=${encodeURIComponent(pickup.toISOString())}&return=${encodeURIComponent(returnAt.toISOString())}&insurance=${insurance}`
      navigate('/auth/login', { state: { from: returnUrl } })
      return
    }
    navigate(`/booking/confirm/${car.id}?pickup=${encodeURIComponent(pickup.toISOString())}&return=${encodeURIComponent(returnAt.toISOString())}&insurance=${insurance}`)
  }

  useEffect(() => {
    if (!coupon.trim()) {
      setCouponState(null)
      return undefined
    }
    const timer = window.setTimeout(() => {
      const valid = coupon.trim().toUpperCase() === 'FLAT100'
      setCouponState(valid ? 'valid' : 'invalid')
      toast[valid ? 'success' : 'error'](valid ? 'FLAT100 applied! Saving ₹100' : 'Invalid or expired coupon')
    }, 800)
    return () => window.clearTimeout(timer)
  }, [coupon])

  useEffect(() => {
    api.get(`/vehicles/${car.id}/unavailable-dates`, { params: { from_date: pickup.toISOString() } })
      .then((response) => setUnavailableDates((response.data.unavailable_dates || []).map((item) => new Date(`${item}T00:00:00`))))
      .catch(() => setUnavailableDates([]))
  }, [car.id, pickup])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      api.get(`/vehicles/${car.id}/availability/check`, {
        params: { pickup_date: pickup.toISOString(), return_date: returnAt.toISOString(), insurance_plan: insurance },
      }).then((response) => setAvailability(response.data)).catch((err) => setAvailability({ available: false, reason: err.response?.data?.detail || 'Unable to check availability', price_breakdown: {} }))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [car.id, insurance, pickup, returnAt])

  function onPickup(date) {
    setPickup(date)
    if (returnAt < addHours(date, car.min_trip_hours || 4)) setReturnAt(addHours(date, car.min_trip_hours || 4))
  }

  return (
    <aside className={`${borderless ? '' : 'rounded-lg border border-zinc-200 bg-white p-4 shadow-lg'}`}>
      <div className="mb-4">
        <p className="text-3xl font-black text-zinc-950">₹{formatMoney(car.price_per_day)}<span className="text-sm font-bold text-zinc-500">/day</span></p>
        <p className="mt-1 text-sm font-bold text-zinc-500">{price.duration?.duration_label || formatDuration(pickup, returnAt)} · {dateRangeLabel(pickup, returnAt)}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DatePicker selected={pickup} onChange={onPickup} showTimeSelect timeIntervals={30} excludeDates={unavailableDates} minDate={new Date()} dateFormat="dd MMM, h:mm aa" className="input h-11" />
        <DatePicker selected={returnAt} onChange={setReturnAt} showTimeSelect timeIntervals={30} excludeDates={unavailableDates} minDate={addHours(pickup, car.min_trip_hours || 4)} dateFormat="dd MMM, h:mm aa" className="input h-11" />
      </div>
      {!availability.available && <div className="mt-3 rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{availability.reason}. {availability.next_available_date && `Next available: ${new Date(availability.next_available_date).toLocaleString('en-IN')}`}</div>}
      {availability.available && <div className="mt-3 rounded-md bg-emerald-50 p-3 text-sm font-bold text-emerald-700">Available for this range.</div>}

      <h3 className="mt-5 text-sm font-black uppercase text-zinc-500">Insurance</h3>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {INSURANCE.map((plan) => (
          <button key={plan.key} onClick={() => setInsurance(plan.key)} className={`relative rounded-md border p-3 text-left ${insurance === plan.key ? 'border-sigfleet bg-red-50' : 'border-zinc-200'}`}>
            {insurance === plan.key && <Check className="absolute right-2 top-2 text-sigfleet" size={15} />}
            <p className="font-black text-zinc-950">{plan.label}</p>
            <p className="text-xs font-bold text-zinc-500">{Math.round(plan.rate * 100)}%</p>
            <p className="mt-1 text-xs text-zinc-500">{plan.text}</p>
          </button>
        ))}
      </div>

      <div className="mt-5 flex gap-2">
        <input className="input h-11" value={coupon} onChange={(event) => setCoupon(event.target.value)} placeholder="Coupon code" />
        <button onClick={() => setCoupon(coupon.trim().toUpperCase())} className="rounded-md bg-zinc-950 px-4 font-black text-white">Apply</button>
      </div>
      {couponState === 'valid' && <p className="mt-2 text-sm font-bold text-emerald-700">✓ ₹100 discount applied</p>}
      {couponState === 'invalid' && <p className="mt-2 text-sm font-bold text-red-700">Invalid coupon code</p>}

      <button onClick={() => setExpanded(!expanded)} className="mt-5 w-full text-left text-sm font-black text-zinc-950">Price breakdown</button>
      {expanded && (
        <div className="mt-3 space-y-2 text-sm font-semibold text-zinc-600">
          <Line label={`Base: ${price.duration?.duration_label || 'selected duration'}`} value={`₹${formatMoney(price.base_amount || 0)}`} />
          <Line label={`Insurance (${insurance})`} value={`₹${formatMoney(price.insurance_amount || 0)}`} />
          <Line label="Coupon discount" value={`-₹${formatMoney(price.coupon_discount || 0)}`} />
          <Line label="Platform fee" value={`₹${formatMoney(price.platform_fee || 0)}`} />
          <Line label="Total" value={`₹${formatMoney(price.total_amount || 0)}`} strong />
          <Line label="Security Deposit" value={`₹${formatMoney(car.security_deposit || 500)} refundable`} />
        </div>
      )}

      {isRestrictedRole ? (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm font-bold text-red-700 text-center">Only customers can rent vehicles.</div>
      ) : (
        <>
          {!user && <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm font-bold text-amber-800">Log in to continue with this booking.</p>}
          {user && !user.is_kyc_verified && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">KYC approval is required before booking.</p>}
          <button
            disabled={!availability.available}
            onClick={handleRentClick}
            className={`mt-4 block w-full rounded-md px-5 py-3 text-center font-black text-white ${availability.available ? 'bg-sigfleet' : 'pointer-events-none bg-zinc-300'}`}
          >
            Rent Now
          </button>
        </>
      )}
    </aside>
  )
}

function Line({ label, value, strong }) {
  return <div className={`flex justify-between gap-3 ${strong ? 'border-t border-zinc-200 pt-3 text-lg font-black text-zinc-950' : ''}`}><span>{label}</span><span>{value}</span></div>
}

function FeaturesGrid({ car }) {
  const items = [`${car.seats} Seats`, car.transmission, car.fuel_type, 'AC', car.features?.includes('music') ? 'Music' : 'Audio', car.features?.includes('gps') ? 'GPS' : 'Verified location', car.features?.includes('keyless') ? 'Keyless' : 'Manager handoff', car.included_km_per_day ? `${car.included_km_per_day} km/day` : 'Fair use']
  return <Section title="Features"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{items.map((item) => <div key={item} className="rounded-md border border-zinc-200 bg-white p-4 text-center font-black text-zinc-800"><ShieldCheck className="mx-auto mb-2 text-sigfleet" size={20} />{item}</div>)}</div></Section>
}

function Description({ text }) {
  const [open, setOpen] = useState(false)
  const display = open || !text || text.length <= 200 ? text : `${text.slice(0, 200)}...`
  return <Section title="Description"><p className="leading-7 text-zinc-700">{display || 'This manager has not added a detailed description yet.'} {text?.length > 200 && <button onClick={() => setOpen(!open)} className="font-black text-sigfleet">{open ? 'Read less' : 'Read more'}</button>}</p></Section>
}

function AvailabilityCalendar({ carId }) {
  const [month, setMonth] = useState(new Date())
  const [availability, setAvailability] = useState({})
  useEffect(() => {
    api.get(`/vehicles/${carId}/availability`, { params: { year: month.getFullYear(), month: month.getMonth() + 1 } }).then((response) => {
      setAvailability(Object.fromEntries((response.data.days || []).map((day) => [day.date, day.status])))
    })
  }, [carId, month])

  const days = useMemo(() => buildMonth(month), [month])
  return (
    <Section title="Availability">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-md border border-zinc-300 px-3 py-2 font-black">Prev</button>
        <h3 className="font-black text-zinc-950">{month.toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</h3>
        <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-md border border-zinc-300 px-3 py-2 font-black">Next</button>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs font-black text-zinc-500">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="mt-2 grid grid-cols-7 gap-2">
        {days.map((day, index) => <DayCell key={`${day?.date}-${index}`} day={day} status={day ? availability[day.iso] : ''} />)}
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-sm font-bold text-zinc-600"><span>🔴 Booked</span><span>🟢 Available</span><span>🟡 Pending booking</span><span>⬜ Past/blocked</span></div>
    </Section>
  )
}

function buildMonth(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1)
  const count = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const blanks = Array.from({ length: first.getDay() }, () => null)
  return blanks.concat(Array.from({ length: count }, (_, index) => {
    const day = new Date(date.getFullYear(), date.getMonth(), index + 1)
    return { date: day, iso: day.toISOString().slice(0, 10) }
  }))
}

function DayCell({ day, status }) {
  if (!day) return <span />
  const past = day.date < new Date(new Date().toDateString())
  const color = past || status === 'blocked' ? 'bg-zinc-100 text-zinc-400' : status === 'booked' ? 'bg-red-100 text-red-700' : status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-700'
  const title = status === 'booked' ? 'Booked' : status === 'pending' ? 'Pending booking' : status === 'blocked' ? 'Blocked' : 'Available'
  return <button title={title} disabled={past || status === 'booked' || status === 'blocked'} className={`aspect-square rounded-md text-sm font-black ${color}`}>{day.date.getDate()}</button>
}

function ManagerSection({ car }) {
  const manager = car.manager_profile || {}
  const year = manager.joined_date ? new Date(manager.joined_date).getFullYear() : new Date().getFullYear()
  const name = manager.name || car.manager_name || 'Manager'
  return <Section title="Manager"><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-4"><img src={manager.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`} alt={`${name} profile photo`} loading="lazy" decoding="async" width="64" height="64" className="h-16 w-16 rounded-full object-cover" /><div><p className="text-xl font-black text-zinc-950">{name}</p><p className="font-bold text-zinc-500">Member since {year}</p><p className="mt-1 text-sm font-bold text-zinc-600">★ {manager.rating || 0} · {manager.total_reviews || 0} reviews · {manager.response_time || 'Responds within a few hours'} · {manager.acceptance_rate || 95}% accepted</p></div></div>{manager.is_super_manager && <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-black text-amber-800">Super Manager</span>}<Link to={`/vehicles?manager_id=${car.manager_id}`} className="font-black text-sigfleet">View all listings by this manager</Link></div></Section>
}

function ReviewsSection({ data, filter, setFilter, onMore }) {
  const breakdown = data?.rating_breakdown || {}
  return <Section title="Reviews"><div className="grid gap-6 lg:grid-cols-[260px_1fr]"><div><p className="text-4xl font-black text-zinc-950">★★★★★ {Number(data?.avg_rating || 0).toFixed(1)}</p>{[5, 4, 3, 2, 1].map((rating) => <div key={rating} className="mt-2 flex items-center gap-2 text-sm font-bold"><span>{rating}★</span><span className="h-2 flex-1 rounded bg-zinc-100"><span className="block h-2 rounded bg-sigfleet" style={{ width: `${Math.min(100, (breakdown[rating] || 0) * 2)}%` }} /></span><span>{breakdown[rating] || 0}</span></div>)}</div><div><div className="mb-4 flex flex-wrap gap-2">{['', 5, 4, 3, 2, 1].map((rating) => <button key={rating || 'all'} onClick={() => setFilter(rating)} className={`rounded-full px-3 py-1 text-sm font-black ${String(filter) === String(rating) ? 'bg-sigfleet text-white' : 'bg-zinc-100 text-zinc-700'}`}>{rating ? `${rating}★` : 'All'}</button>)}</div><div className="space-y-4">{(data?.reviews || []).map((review) => <ReviewCard key={review._id} review={review} />)}</div>{(data?.reviews || []).length < (data?.total || 0) && <button onClick={onMore} className="mt-4 rounded-md border border-zinc-300 px-4 py-2 font-black">Load 5 more reviews</button>}</div></div></Section>
}

function ReviewCard({ review }) {
  const name = review.reviewer_name || 'Customer'
  return <article className="rounded-md border border-zinc-200 bg-white p-4"><div className="flex gap-3"><img src={review.reviewer_photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`} alt={`${name} profile photo`} loading="lazy" decoding="async" width="44" height="44" className="h-11 w-11 rounded-full" /><div><p className="font-black text-zinc-950">{name}</p><p className="text-sm font-bold text-zinc-500">{relativeDate(review.created_at)}</p></div></div><p className="mt-3 font-black text-amber-500">{'★'.repeat(review.rating || 0)}</p><p className="mt-2 leading-6 text-zinc-700">{review.body || review.title || 'Great trip.'}</p>{review.manager_reply && <div className="mt-3 rounded-md bg-zinc-50 p-3 text-sm"><p className="font-black text-zinc-950">Response from manager</p><p className="mt-1 text-zinc-600">{review.manager_reply}</p></div>}<span className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700"><Check size={13} /> Verified trip</span></article>
}

function DetailError({ message, onRetry }) {
  return (
    <main id="main-content" className="grid min-h-screen place-items-center bg-zinc-50 p-6">
      <div className="max-w-md rounded-lg border border-red-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-red-50 text-sigfleet"><AlertTriangle size={36} /></div>
        <h1 className="mt-5 text-2xl font-black text-zinc-950">Vehicle details unavailable</h1>
        <p className="mt-2 font-semibold text-zinc-600">{message}</p>
        <button onClick={onRetry} className="mt-5 rounded-md bg-sigfleet px-5 py-3 font-black text-white">Retry</button>
      </div>
    </main>
  )
}

function LocationMap({ car }) {
  const center = [car.location_lat || 12.9716, car.location_lng || 77.5946]
  return <Section title="Pickup Area"><div className="h-80 overflow-hidden rounded-lg border border-zinc-200"><MapContainer center={center} zoom={14} className="h-full w-full"><TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><Circle center={center} radius={200} pathOptions={{ color: '#e31837', fillColor: '#e31837', fillOpacity: 0.12 }} /><Marker position={center} icon={new DivIcon({ className: '', html: '<div class="car-marker">🚗</div>', iconSize: [40, 40] })} /></MapContainer></div><p className="mt-3 flex items-center gap-2 text-sm font-bold text-zinc-500"><MapPin size={16} /> Exact pickup address shared after booking confirmation</p></Section>
}

function SimilarCars({ vehicles }) {
  if (!vehicles.length) return null
  return <Section title="Similar Cars"><div className="flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-4">{vehicles.map((car) => <div key={car.id} className="w-80 shrink-0 lg:w-auto"><VehicleCard car={car} /></div>)}</div></Section>
}

function Section({ title, children }) {
  return <section className="rounded-lg border border-zinc-200 bg-white p-5"><h2 className="mb-4 text-2xl font-black text-zinc-950">{title}</h2>{children}</section>
}

function relativeDate(value) {
  if (!value) return 'Recently'
  const days = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 86400000))
  if (days < 1) return 'Today'
  if (days < 30) return `${days} days ago`
  const months = Math.round(days / 30)
  return `${months} month${months > 1 ? 's' : ''} ago`
}
