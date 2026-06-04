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
import Navbar from '../components/layout/Navbar'

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
    // Reviews re-fetch when filter changes — correct
    api.get(`/reviews/car/${car.id}`, { params: { page: 1, limit: 5, rating: reviewFilter || undefined } }).then((response) => {
      setReviews(response.data)
      setReviewPage(1)
    })
  }, [car, reviewFilter])

  useEffect(() => {
    if (!car) return
    // Similar vehicles only need to load once per car — not on every review filter change
    api.get('/vehicles/', { params: { city: car.location_city, category_id: car.category_id, exclude: car.id, limit: 4 } })
      .then((response) => setSimilar(response.data.vehicles || []))
  }, [car?.id])

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
            <Dialog.Description className="sr-only">
              Choose pickup and return times, insurance, and confirm this vehicle booking.
            </Dialog.Description>
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
            <Dialog.Description className="sr-only">
              Browse photos of this vehicle in a larger gallery.
            </Dialog.Description>
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
      {/* Solid white navbar — always visible on detail page */}
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white shadow-sm">
        <nav className="mx-auto flex min-h-[64px] max-w-7xl items-center justify-between px-4">
          <Link to="/" className="flex items-center">
            <span className="text-2xl font-black text-zinc-900">Sig<span className="text-[#E31837]">Fleet</span></span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/vehicles" className="text-sm font-black text-zinc-800 hover:text-[#E31837]">Browse Vehicles</Link>
            {!user ? (
              <div className="flex items-center gap-2">
                <Link to="/auth/login" state={{ from: location.pathname + location.search }} className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-black text-zinc-900 hover:bg-zinc-50">Login</Link>
                <Link to="/auth/register" className="rounded-md bg-[#E31837] px-4 py-2 text-sm font-black text-white">Register</Link>
              </div>
            ) : (
              <Link to={user.role === 'customer' ? '/customer/dashboard' : user.role === 'vehicle_manager' ? '/manager/dashboard' : '/admin/dashboard'} className="rounded-md bg-[#E31837] px-4 py-2 text-sm font-black text-white">
                Dashboard
              </Link>
            )}
          </div>
        </nav>
      </header>
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
  const minTripHours = Math.max(2, Number(car.min_trip_hours || 4))
  const maxTripHours = Math.max(minTripHours, Number(car.max_trip_days || 30) * 24)
  const defaultPickup = addHours(new Date(), 24)
  const defaultDurationHours = Math.min(Math.max(minTripHours, 24), maxTripHours)
  const [pickup, setPickup] = useState(addHours(new Date(), 24))
  const [returnAt, setReturnAt] = useState(addHours(defaultPickup, defaultDurationHours))
  const [insurance, setInsurance] = useState('standard')
  const [withChauffeur, setWithChauffeur] = useState(false)
  const [pickupLocation, setPickupLocation] = useState('')
  const [dropLocation, setDropLocation] = useState('')
  const [coupon, setCoupon] = useState('')
  const [couponState, setCouponState] = useState(null) // null | 'valid' | 'invalid' | 'checking'
  const [couponMsg, setCouponMsg] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [showCoupons, setShowCoupons] = useState(false)
  const [availableCoupons, setAvailableCoupons] = useState([])
  const [loadingCoupons, setLoadingCoupons] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [unavailableDates, setUnavailableDates] = useState([])
  const [availability, setAvailability] = useState({ available: true, reason: 'Available', price_breakdown: {} })
  const price = availability.price_breakdown || {}
  const navigate = useNavigate()
  const isRestrictedRole = user && (user.role === 'vehicle_manager' || user.role === 'admin')
  const isBike = car.vehicle_type === 'bike'

  useEffect(() => {
    if (isBike && withChauffeur) setWithChauffeur(false)
  }, [isBike, withChauffeur])

  // Calculate days for chauffeur fee
  const numDays = Math.max(1, Math.ceil((returnAt - pickup) / (1000 * 60 * 60 * 24)))
  const chauffeurFee = withChauffeur ? 800 * numDays : 0

  const [submitting, setSubmitting] = useState(false)
  const [bookingError, setBookingError] = useState('')

  const handleRentClick = async () => {
    if (!user) {
      const returnUrl = `${window.location.pathname}`
      navigate('/auth/login', { state: { from: returnUrl } })
      return
    }
    if (!availability.available) return

    setSubmitting(true)
    setBookingError('')

    // Validate location fields
    if (!isBike && withChauffeur) {
      if (!pickupLocation.trim()) {
        setBookingError('Please enter your pickup address for chauffeur service.')
        setSubmitting(false)
        return
      }
      if (!dropLocation.trim()) {
        setBookingError('Please enter your drop-off address for chauffeur service.')
        setSubmitting(false)
        return
      }
    }

    try {
      const response = await api.post('/bookings/', {
        vehicle_id: car.id,
        pickup_datetime: pickup.toISOString(),
        return_datetime: returnAt.toISOString(),
        insurance_plan: insurance,
        with_chauffeur: isBike ? false : withChauffeur,
        coupon_code: appliedCoupon?.code || undefined,
        pickup_location: pickupLocation.trim() || undefined,
        drop_location: !isBike && withChauffeur ? (dropLocation.trim() || undefined) : undefined,
      })
      const data = response.data
      // Always go to payment page so user can choose their payment method
      // (Card / UPI / Net Banking / Wallet)
      navigate(`/booking/pay/${data.booking_id}`)
    } catch (err) {
      const detail = err.response?.data?.detail
      const msg = typeof detail === 'string' ? detail : detail?.message || 'Unable to create booking.'
      setBookingError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // Fetch available coupons on mount
  useEffect(() => {
    setLoadingCoupons(true)
    api.get('/coupons')
      .then((res) => setAvailableCoupons(res.data?.items ?? res.data ?? []))
      .catch(() => setAvailableCoupons([]))
      .finally(() => setLoadingCoupons(false))
  }, [])

  async function applyCoupon(code) {
    const normalized = (code || coupon).trim().toUpperCase()
    if (!normalized) return
    setCouponState('checking')
    setCouponMsg('')
    try {
      const baseAmount = Number(price.base_amount || car.price_per_day * numDays || 0)
      const res = await api.post('/coupons/validate', { code: normalized, booking_amount: baseAmount })
      const data = res.data
      if (data?.valid) {
        setCouponState('valid')
        setCouponMsg(data.message || `${normalized} applied! You save ₹${data.discount_amount}`)
        setAppliedCoupon({ code: normalized, discount_amount: data.discount_amount })
        toast.success(data.message || `Coupon ${normalized} applied!`)
      } else {
        setCouponState('invalid')
        setCouponMsg(data?.message || 'Invalid or expired coupon')
        setAppliedCoupon(null)
        toast.error(data?.message || 'Invalid or expired coupon')
      }
    } catch (err) {
      const msg = err.response?.data?.detail || 'Invalid coupon code'
      setCouponState('invalid')
      setCouponMsg(typeof msg === 'string' ? msg : 'Invalid coupon code')
      setAppliedCoupon(null)
      toast.error(typeof msg === 'string' ? msg : 'Invalid coupon code')
    }
  }

  function removeCoupon() {
    setCoupon('')
    setCouponState(null)
    setCouponMsg('')
    setAppliedCoupon(null)
  }

  useEffect(() => {
    api.get(`/vehicles/${car.id}/unavailable-dates`, { params: { from_date: pickup.toISOString() } })
      .then((response) => setUnavailableDates((response.data.unavailable_dates || []).map((item) => new Date(`${item}T00:00:00`))))
      .catch(() => setUnavailableDates([]))
  }, [car.id, pickup])

  useEffect(() => {
    // Debounced availability check — 600ms prevents double-fire when pickup
    // change also triggers returnAt to update (two state changes, one request)
    const timer = window.setTimeout(() => {
      api.get(`/vehicles/${car.id}/availability/check`, {
        params: { pickup_date: pickup.toISOString(), return_date: returnAt.toISOString(), insurance_plan: insurance },
      }).then((response) => setAvailability(response.data)).catch((err) => {
        const detail = err.response?.data?.detail
        setAvailability({
          available: false,
          reason: typeof detail === 'string' ? detail : detail?.message || 'Unable to check availability',
          price_breakdown: {},
        })
      })
    }, 600)
    return () => window.clearTimeout(timer)
  }, [car.id, insurance, pickup, returnAt])

  function onPickup(date) {
    const minPickup = addHours(new Date(), 2)
    if (date < minPickup) {
      toast.error('Pickup must be at least 2 hours from now')
      setPickup(minPickup)
      if (returnAt < addHours(minPickup, minTripHours) || returnAt > addHours(minPickup, maxTripHours)) {
        setReturnAt(addHours(minPickup, Math.min(Math.max(minTripHours, 24), maxTripHours)))
      }
      return
    }
    setPickup(date)
    if (returnAt < addHours(date, minTripHours) || returnAt > addHours(date, maxTripHours)) {
      setReturnAt(addHours(date, Math.min(Math.max(minTripHours, 24), maxTripHours)))
    }
  }

  function onReturn(date) {
    const minReturn = addHours(pickup, minTripHours)
    const maxReturn = addHours(pickup, maxTripHours)
    if (date < minReturn) {
      toast.error(`Trip must be at least ${minTripHours} hours`)
      setReturnAt(minReturn)
      return
    }
    if (date > maxReturn) {
      toast.error(`Trip cannot exceed ${car.max_trip_days || 30} day${Number(car.max_trip_days || 30) === 1 ? '' : 's'}`)
      setReturnAt(maxReturn)
      return
    }
    setReturnAt(date)
  }

  const baseAmount = Number(price.base_amount || car.price_per_day * numDays || 0)

  return (
    <aside className={`${borderless ? '' : 'rounded-lg border border-zinc-200 bg-white p-4 shadow-lg'}`}>
      <div className="mb-4">
        <p className="text-3xl font-black text-zinc-950">₹{formatMoney(car.price_per_day)}<span className="text-sm font-bold text-zinc-500">/day</span></p>
        <p className="mt-1 text-sm font-bold text-zinc-500">{price.duration?.duration_label || formatDuration(pickup, returnAt)} · {dateRangeLabel(pickup, returnAt)}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DatePicker selected={pickup} onChange={onPickup} showTimeSelect timeIntervals={30} excludeDates={unavailableDates} minDate={new Date()} dateFormat="dd MMM, h:mm aa" className="input h-11" />
        <DatePicker selected={returnAt} onChange={onReturn} showTimeSelect timeIntervals={30} excludeDates={unavailableDates} minDate={addHours(pickup, minTripHours)} maxDate={addHours(pickup, maxTripHours)} dateFormat="dd MMM, h:mm aa" className="input h-11" />
      </div>
      {!availability.available && <div className="mt-3 rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{availability.reason}. {availability.next_available_date && `Next available: ${new Date(availability.next_available_date).toLocaleString('en-IN')}`}</div>}
      {availability.available && <div className="mt-3 rounded-md bg-emerald-50 p-3 text-sm font-bold text-emerald-700">Available for this range.</div>}

      {/* Rental Type — Chauffeur Toggle */}
      <h3 className="mt-5 text-sm font-black uppercase text-zinc-500">Rental Type</h3>
      {isBike ? (
        <div className="mt-2 rounded-lg border-2 border-sigfleet bg-red-50 p-3">
          <p className="font-black text-sm text-zinc-950">Self Ride</p>
          <p className="text-xs font-bold text-zinc-500">Bikes are booked without chauffeur service.</p>
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setWithChauffeur(false)}
            className={`rounded-lg border-2 p-3 text-left transition ${!withChauffeur ? 'border-sigfleet bg-red-50' : 'border-zinc-200 hover:border-zinc-300'}`}
          >
            <p className="font-black text-sm text-zinc-950">Self Drive</p>
            <p className="text-xs font-bold text-zinc-500">Free</p>
            <p className="text-xs text-zinc-400 mt-1">Drive yourself</p>
          </button>
          <button
            type="button"
            onClick={() => setWithChauffeur(true)}
            className={`rounded-lg border-2 p-3 text-left transition ${withChauffeur ? 'border-sigfleet bg-red-50' : 'border-zinc-200 hover:border-zinc-300'}`}
          >
            <p className="font-black text-sm text-zinc-950">With Chauffeur</p>
            <p className="text-xs font-bold text-sigfleet">+₹800/day</p>
            <p className="text-xs text-zinc-400 mt-1">Professional driver</p>
          </button>
        </div>
      )}

      {/* Location fields — conditional on rental type */}
      <div className="mt-4 space-y-3">
        {!isBike && withChauffeur ? (
          <>
            {/* Chauffeur: ask for both pickup and drop */}
            <div>
              <label className="text-xs font-black uppercase text-zinc-500">
                Pickup Address <span className="text-red-500">*</span>
              </label>
              <input
                className="input mt-1 h-11"
                value={pickupLocation}
                onChange={(e) => setPickupLocation(e.target.value)}
                placeholder="Enter your pickup address"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase text-zinc-500">
                Drop Address <span className="text-red-500">*</span>
              </label>
              <input
                className="input mt-1 h-11"
                value={dropLocation}
                onChange={(e) => setDropLocation(e.target.value)}
                placeholder="Enter your drop-off address"
              />
            </div>
          </>
        ) : (
          /* Self drive: show vehicle store address, let customer optionally specify pickup point */
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs font-black uppercase text-zinc-500 mb-1">Pickup Location</p>
            <p className="text-sm font-bold text-zinc-800">
              📍 {car.location_address || `${car.location_area || ''}, ${car.location_city}`.trim().replace(/^,\s*/, '')}
            </p>
            <p className="mt-1 text-xs font-bold text-zinc-500">
              You will collect the vehicle from this address. Exact details shared after booking confirmation.
            </p>
          </div>
        )}
      </div>

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

      {/* Coupon Section */}
      <div className="mt-5">
        <div className="flex gap-2">
          <input
            className="input h-11 flex-1"
            value={coupon}
            onChange={(event) => setCoupon(event.target.value.toUpperCase())}
            placeholder="Coupon code"
          />
          <button
            onClick={() => applyCoupon(coupon)}
            disabled={couponState === 'checking'}
            className="rounded-md bg-zinc-950 px-4 font-black text-white disabled:opacity-60"
          >
            {couponState === 'checking' ? '…' : 'Apply'}
          </button>
        </div>
        {couponState === 'valid' && (
          <div className="mt-2 flex items-center justify-between">
            <p className="text-sm font-bold text-emerald-700">✓ {couponMsg}</p>
            <button onClick={removeCoupon} className="text-xs font-bold text-zinc-500 underline">Remove</button>
          </div>
        )}
        {couponState === 'invalid' && <p className="mt-2 text-sm font-bold text-red-700">{couponMsg}</p>}

        {/* View available coupons */}
        <button
          type="button"
          onClick={() => setShowCoupons(!showCoupons)}
          className="mt-1 text-xs font-bold text-sigfleet underline hover:text-red-700"
        >
          {showCoupons ? 'Hide coupons ▲' : 'View available coupons ▼'}
        </button>

        {showCoupons && (
          <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200">
            {loadingCoupons && <div className="p-3 text-sm text-zinc-500">Loading coupons…</div>}
            {!loadingCoupons && availableCoupons.length === 0 && (
              <div className="p-3 text-sm text-zinc-500">No active coupons available.</div>
            )}
            {availableCoupons.map((c) => {
              const eligible = baseAmount >= Number(c.min_booking_amount || 0)
              return (
                <div key={c.code} className={`flex items-center justify-between border-b p-3 last:border-0 ${eligible ? 'bg-white' : 'bg-zinc-50 opacity-60'}`}>
                  <div>
                    <p className="font-mono font-black text-sm text-sigfleet">{c.code}</p>
                    <p className="text-xs text-zinc-600">{c.description}</p>
                    <p className="text-xs text-zinc-400">
                      {eligible
                        ? `Save up to ₹${formatMoney(c.max_discount || 0)}`
                        : `Min booking ₹${formatMoney(c.min_booking_amount || 0)}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!eligible}
                    onClick={() => { setCoupon(c.code); setShowCoupons(false); applyCoupon(c.code) }}
                    className={`rounded-full border px-3 py-1 text-xs font-black ${eligible ? 'border-sigfleet text-sigfleet hover:bg-red-50' : 'cursor-not-allowed border-zinc-300 text-zinc-400'}`}
                  >
                    Apply
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <button onClick={() => setExpanded(!expanded)} className="mt-5 w-full text-left text-sm font-black text-zinc-950">Price breakdown</button>
      {expanded && (
        <div className="mt-3 space-y-2 text-sm font-semibold text-zinc-600">
          <Line label={`Base: ${price.duration?.duration_label || `${numDays} day${numDays !== 1 ? 's' : ''}`}`} value={`₹${formatMoney(price.base_amount || car.price_per_day * numDays || 0)}`} />
          {withChauffeur && <Line label={`Chauffeur: ₹800 × ${numDays} day${numDays !== 1 ? 's' : ''}`} value={`₹${formatMoney(chauffeurFee)}`} />}
          <Line label={`Insurance (${insurance})`} value={`₹${formatMoney(price.insurance_amount || 0)}`} />
          {appliedCoupon && <Line label={`Coupon (${appliedCoupon.code})`} value={`-₹${formatMoney(appliedCoupon.discount_amount || 0)}`} />}
          <Line label="Platform fee" value={`₹${formatMoney(price.platform_fee || 0)}`} />
          <Line label="Total" value={`₹${formatMoney((price.total_amount || 0) + chauffeurFee - (appliedCoupon?.discount_amount || 0))}`} strong />
          <Line label="Security Deposit" value={`₹${formatMoney(car.security_deposit || 500)} refundable`} />
        </div>
      )}

      {isRestrictedRole ? (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm font-bold text-red-700 text-center">Only customers can rent vehicles.</div>
      ) : (
        <>
          {!user && <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm font-bold text-amber-800">Log in to continue with this booking.</p>}
          {user && !user.is_kyc_verified && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">KYC approval is required before booking. <Link to="/customer/kyc" className="underline">Complete KYC →</Link></p>}
          {bookingError && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{bookingError}</p>}
          <button
            disabled={!availability.available || submitting || (user && !user.is_kyc_verified)}
            onClick={handleRentClick}
            className={`mt-4 flex w-full items-center justify-center gap-2 rounded-md px-5 py-3 font-black text-white ${availability.available && (!user || user.is_kyc_verified) ? 'bg-sigfleet' : 'pointer-events-none bg-zinc-300'}`}
          >
            {submitting ? <><Loader2 size={18} className="animate-spin" /> Creating booking…</> : 'Book Now'}
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
