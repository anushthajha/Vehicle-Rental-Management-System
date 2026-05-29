import React, { useEffect, useState } from 'react'
import * as Accordion from '@radix-ui/react-accordion'
import { motion, useInView } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { ArrowRight, CalendarDays, Car as Vehicle, ChevronDown, MapPin, ShieldCheck, Star, WalletCards } from 'lucide-react'
import api from '../services/api'
import Navbar from '../components/layout/Navbar'
import VehicleCard from '../components/vehicle/VehicleCard'
import { useVehicleCategories } from '../hooks/useVehicleCategories'
import { useAuthStore } from '../context/AuthContext'


const cities = ['Bengaluru', 'Mumbai', 'Delhi', 'Pune', 'Chennai', 'Goa', 'Hyderabad', 'Jaipur']
const cityImages = {
  Bengaluru: 'https://images.unsplash.com/photo-1596176530529-78163a4f7af2?w=600',
  Mumbai: 'https://images.unsplash.com/photo-1595658658481-d53d3f999875?w=600',
  Delhi: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=600',
  Pune: 'https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=600',
  Chennai: 'https://images.unsplash.com/photo-1582510003544-4d00b7f74220?w=600',
  Hyderabad: 'https://images.unsplash.com/photo-1545431781-3e1b506e9a37?w=600',
  Jaipur: 'https://images.unsplash.com/photo-1477587458883-47145ed94245?w=600',
  Goa: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=600',
}
const rates = { hatchback: 550, sedan: 750, suv: 1050, luxury: 2500, electric: 850 }

export default function HomePage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (user && location.pathname === '/') {
      const paths = {
        customer: '/customer/dashboard',
        vehicle_manager: '/manager/dashboard',
        admin: '/admin/dashboard',
      }
      navigate(paths[user.role] || '/', { replace: true })
    }
  }, [location.pathname, user, navigate])

  const [city, setCity] = useState('Bengaluru')
  const [pickup, setPickup] = useState('')
  const [dropoff, setDropoff] = useState('')
  const [tab, setTab] = useState('customer')
  const [featured, setFeatured] = useState([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(15)
  const [category, setCategory] = useState('sedan')
  const { categories } = useVehicleCategories()

  useEffect(() => {
    api.get('/vehicles/', { params: { limit: 8, status: 'approved', is_available: true, sort_by: 'recommended' } }).then((response) => {
      const payload = response.data || response || {}
      setFeatured(Array.isArray(payload.vehicles) ? payload.vehicles : Array.isArray(payload.items) ? payload.items : Array.isArray(payload) ? payload : [])
    }).catch(() => setFeatured([])).finally(() => setLoading(false))
  }, [])

  const [counts, setCounts] = useState({})
  const [countsLoading, setCountsLoading] = useState(true)
  const [countsFailed, setCountsFailed] = useState(false)

  useEffect(() => {
    const fetchCounts = async () => {
      setCountsLoading(true)
      setCountsFailed(false)
      try {
        const response = await api.get('/vehicles/city-counts')
        const raw = response.data || response || {}
        const normalized = {}
        Object.entries(raw).forEach(([key, value]) => {
          if (typeof value === 'number') {
            normalized[key] = value
            normalized[key.toLowerCase()] = value
          }
        })
        setCounts(normalized)
      } catch (err) {
        setCountsFailed(true)
        setCounts({})
      } finally {
        setCountsLoading(false)
      }
    }
    fetchCounts()
  }, [])

  const estimated = Math.round(days * rates[category] * 0.85)
  const search = () => {
    // Search is PUBLIC — no login required. Only booking requires login.
    const params = new URLSearchParams()
    params.set('city', city)
    if (pickup) params.set('pickup_date', new Date(pickup).toISOString())
    if (dropoff) params.set('return_date', new Date(dropoff).toISOString())
    navigate(`/vehicles?${params.toString()}`)
  }

  const handleCategoryClick = (catId) => {
    navigate(`/vehicles?category_id=${catId}`)
  }

  const handleViewAllClick = () => {
    navigate(`/vehicles?city=${encodeURIComponent(city)}`)
  }

  const handleCityClick = (cityName) => {
    navigate(`/vehicles?city=${encodeURIComponent(cityName)}`)
  }

  return (
    <main id="main-content" className="bg-[#F9FAFB] text-[#111827]">
      <Helmet>
        <title>SigFleet — Self-Drive Vehicle Rentals</title>
        <meta name="description" content="Rent self-drive vehicles across 100+ Indian cities. Verified managers, comprehensive insurance, instant booking." />
      </Helmet>
      <Navbar />
      <section className="relative min-h-[92vh] overflow-hidden bg-[#111827]">
        <img src="https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=1920" alt="Self-drive car on an open road" loading="eager" decoding="async" width="1920" height="1080" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/55 to-[#E31837]/35" />
        <div className="relative mx-auto flex min-h-[92vh] max-w-7xl flex-col justify-center px-4 pb-16 pt-32 text-white">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-200">India's #1 Self-Drive Platform</p>
            <h1 className="font-display mt-4 text-5xl font-extrabold leading-none tracking-tight md:text-7xl">Drive on your own terms</h1>
            <p className="mt-5 max-w-2xl text-lg font-medium text-white/85 md:text-2xl">Choose from 25,000+ verified vehicles across 100+ cities. No driver, no hassle.</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15 }} className="mt-10 w-full max-w-5xl rounded-lg border border-white/25 bg-white/15 p-4 shadow-2xl backdrop-blur-xl">
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_1.2fr_0.8fr] items-stretch">
              <label className="rounded-md bg-white/95 p-3 text-[#111827] flex flex-col justify-center min-h-[64px]"><span className="text-[10px] font-medium uppercase text-zinc-500">City</span><div className="mt-1 flex items-center gap-2"><MapPin size={17} className="text-[#E31837]" /><select value={city} onChange={(event) => setCity(event.target.value)} className="w-full bg-transparent font-semibold outline-none">{cities.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={16} /></div></label>
              <label className="rounded-md bg-white/95 p-3 text-[#111827] flex flex-col justify-center min-h-[64px]"><span className="text-[10px] font-medium uppercase text-zinc-500">Pickup Date & Time</span><div className="mt-1 flex items-center gap-2"><CalendarDays size={17} className="text-[#E31837]" /><input type="datetime-local" value={pickup} min={new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16)} onChange={(event) => setPickup(event.target.value)} className="w-full bg-transparent text-sm font-semibold outline-none" /></div></label>
              <label className="rounded-md bg-white/95 p-3 text-[#111827] flex flex-col justify-center min-h-[64px]"><span className="text-[10px] font-medium uppercase text-zinc-500">Return Date & Time</span><div className="mt-1 flex items-center gap-2"><CalendarDays size={17} className="text-[#E31837]" /><input type="datetime-local" value={dropoff} min={pickup || new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 16)} onChange={(event) => setDropoff(event.target.value)} className="w-full bg-transparent text-sm font-semibold outline-none" /></div></label>
              <button onClick={search} className="shine-hover relative overflow-hidden rounded-md bg-[#E31837] px-6 py-3 font-semibold text-white h-full flex items-center justify-center min-h-[64px] hover:bg-red-700 transition duration-200"><span className="relative flex items-center justify-center gap-2">Search Vehicles <ArrowRight size={18} /></span></button>
            </div>
          </motion.div>
        </div>
      </section>
      <StatsStrip />
      <section id="how" className="bg-white px-4 py-20"><div className="mx-auto max-w-7xl"><SectionTitle eyebrow="How it works" title="Simple for every kind of driver" /><div className="mx-auto mt-8 flex w-fit rounded-full bg-zinc-100 p-1">{[['customer', 'For Customers'], ['manager', 'For Managers']].map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`rounded-full px-5 py-2 text-sm font-semibold ${tab === key ? 'bg-[#E31837] text-white' : 'text-zinc-700'}`}>{label}</button>)}</div><div className="mt-10 grid gap-5 md:grid-cols-3">{(tab === 'customer' ? customerSteps : managerSteps).map((step, index) => <StepCard key={step.title} index={index + 1} {...step} />)}</div></div></section>
      <section className="px-4 py-20"><div className="mx-auto max-w-7xl"><SectionTitle title="Find your perfect ride" />
        {/* Vehicle type quick tabs */}
        <div className="mt-6 flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
          {[
            { slug: 'car', label: 'Cars', emoji: '🚗', desc: 'Hatchbacks, Sedans, SUVs & more' },
            { slug: 'bike', label: 'Bikes', emoji: '🏍️', desc: 'Sport bikes, Cruisers & Scooters' },
            { slug: 'traveller', label: 'Travellers', emoji: '🚌', desc: 'Vans & Mini buses for groups' },
          ].map(({ slug, label, emoji, desc }) => (
            <button
              key={slug}
              onClick={() => navigate(`/vehicles?vehicle_type=${slug}`)}
              className="shrink-0 rounded-lg border border-zinc-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl min-w-[200px]"
            >
              <span className="text-3xl">{emoji}</span>
              <h3 className="mt-3 font-black text-zinc-950">{label}</h3>
              <p className="mt-1 text-sm font-semibold text-zinc-500">{desc}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-black text-[#E31837]">Browse <ArrowRight size={14} /></span>
            </button>
          ))}
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{categories.map((cat) => <button type="button" key={cat.id} onClick={() => handleCategoryClick(cat.id)} className="w-full text-left group rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"><Vehicle className="text-[#E31837]" size={34} /><h3 className="mt-5 font-display text-lg font-semibold">{cat.name}</h3><p className="mt-2 text-sm font-medium text-zinc-500">{cat.vehicle_count || 0} vehicles</p><span className="mt-4 inline-flex border-b-2 border-transparent pb-1 text-sm font-semibold text-[#E31837] transition group-hover:border-[#E31837]">Browse <ArrowRight size={15} className="ml-1" /></span></button>)}</div></div></section>
      <section className="bg-white px-4 py-20"><div className="mx-auto max-w-7xl"><SectionTitle title="Top picks near you" subtitle="Hand-picked, highly-rated vehicles by verified managers" /><div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{loading ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-80 animate-pulse rounded-lg bg-zinc-100" />) : featured.slice(0, 8).map((car) => <VehicleCard key={car.id} car={car} />)}</div><button onClick={handleViewAllClick} className="mt-8 inline-flex font-semibold text-[#E31837] hover:underline">View all vehicles in your city <ArrowRight className="ml-1" size={18} /></button></div></section>
      <section className="px-4 py-20"><div className="mx-auto max-w-7xl"><SectionTitle title="Explore India, your way" /><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cities.map((item) => <button key={item} onClick={() => handleCityClick(item)} className="w-full text-left group relative h-56 overflow-hidden rounded-lg bg-zinc-900 shadow-sm"><img src={cityImages[item]} alt={`${item} city destination`} loading="lazy" decoding="async" width="600" height="400" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=600' }} /><div className="absolute inset-0 bg-black/45 transition group-hover:bg-black/25" /><div className="absolute inset-x-0 bottom-0 p-5 text-white"><h3 className="font-display text-2xl font-bold">{item}</h3>{countsLoading ? <span className="mt-2 block h-4 w-28 animate-pulse rounded bg-white/35" /> : <p className="mt-1 font-medium">{countsFailed ? '— cars available' : `${Number(counts[item] || counts[item.toLowerCase()] || 0)} cars available`}</p>}</div></button>)}</div></div></section>
      <section className="bg-zinc-100 px-4 py-20"><div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_1fr] lg:items-center"><div><SectionTitle align="left" title="How much can you earn?" subtitle="Estimate monthly take-home earnings from sharing your car." /><button type="button" onClick={() => navigate('/auth/register', { state: { intendedRole: 'vehicle_manager' } })} className="mt-8 inline-flex rounded-md bg-[#E31837] px-5 py-3 font-semibold text-white">Become a Manager Free <ArrowRight className="ml-2" size={18} /></button></div><div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"><label className="font-semibold">Days per month I can share my car: {days}</label><input type="range" min="5" max="25" value={days} onChange={(event) => setDays(Number(event.target.value))} className="mt-4 w-full accent-[#E31837]" /><label className="mt-5 block font-semibold">My car category:<select value={category} onChange={(event) => setCategory(event.target.value)} className="input mt-2">{Object.keys(rates).map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label><div className="mt-6 rounded-lg bg-[#111827] p-5 text-white"><p className="text-sm font-medium text-white/70">Estimated monthly earnings</p><p className="font-display mt-1 text-4xl font-extrabold">₹{estimated.toLocaleString('en-IN')}</p><p className="mt-2 text-sm font-medium text-white/70">10M+ customers have already earned with SigFleet</p></div></div></div></section>
      <section className="bg-white px-4 py-20"><div className="mx-auto max-w-7xl"><div className="grid gap-4 md:grid-cols-4">{trust.map((item) => { const Icon = item.icon; return <div key={item.title} className="rounded-lg border border-zinc-200 p-5"><Icon className="text-[#E31837]" /><h3 className="mt-4 font-semibold">{item.title}</h3><p className="mt-2 text-sm font-normal leading-relaxed text-zinc-600">{item.text}</p></div> })}</div></div></section>
      <LiveReviews />
      <FAQ />
      <HomeFooter />
    </main>
  )
}

function StatsStrip() {
  const ref = React.useRef(null)
  const visible = useInView(ref, { once: true, margin: '-80px' })
  return <section ref={ref} className="relative z-10 -mt-10 px-4"><div className="mx-auto grid max-w-6xl gap-3 rounded-lg bg-white p-5 shadow-xl md:grid-cols-4">{[['10M+', 'Trips'], ['25,000+', 'Cars'], ['100+', 'Cities'], ['4.8', 'Avg Rating']].map(([num, label]) => <div key={label} className="text-center"><motion.p initial={{ opacity: 0, y: 10 }} animate={visible ? { opacity: 1, y: 0 } : {}} className="font-display text-4xl font-extrabold text-[#E31837] md:text-5xl">{num}</motion.p><p className="font-medium text-zinc-500">{label}</p></div>)}</div></section>
}

function SectionTitle({ eyebrow, title, subtitle, align = 'center' }) {
  return <div className={align === 'center' ? 'text-center' : ''}>{eyebrow && <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#E31837]">{eyebrow}</p>}<h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">{title}</h2>{subtitle && <p className="mx-auto mt-3 max-w-2xl text-lg font-normal leading-relaxed text-zinc-600">{subtitle}</p>}</div>
}

function StepCard({ index, title, text }) {
  return <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"><span className="grid h-12 w-12 place-items-center rounded-full bg-[#E31837] font-display text-xl font-bold text-white">{index}</span><h3 className="mt-5 font-display text-lg font-semibold">{title}</h3><p className="mt-2 text-base font-normal leading-relaxed text-zinc-600">{text}</p></div>
}

function LiveReviews() {
  const [reviews, setReviews] = React.useState([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    api.get('/reviews/recent', { params: { limit: 20 } })
      .then((res) => setReviews(res.data?.reviews || []))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false))
  }, [])

  // Fallback static reviews shown while loading or if API returns nothing
  const fallback = [
    { id: 'f1', reviewer_name: 'Radhika M.', rating: 5, title: 'Amazing experience!', body: 'Booked a Creta for our Coorg trip — manager was amazing and car was spotless. Will definitely book again.', created_at: null },
    { id: 'f2', reviewer_name: 'Aryan K.', rating: 5, title: 'Way better than cabs', body: 'Easy booking, clean car, smooth pickup. Way better than cabs for road trips! Highly recommend SigFleet.', created_at: null },
    { id: 'f3', reviewer_name: 'Priya S.', rating: 5, title: 'Perfect for Leh trip', body: 'The Thar we rented for Leh was perfect. Great condition, manager was very helpful throughout the journey.', created_at: null },
    { id: 'f4', reviewer_name: 'Karthik R.', rating: 4, title: 'Smooth and reliable', body: 'Booked a sedan for a weekend drive. Everything was smooth — pickup, drive, and return. Great platform.', created_at: null },
    { id: 'f5', reviewer_name: 'Sneha T.', rating: 5, title: 'Best rental platform', body: 'Used SigFleet for the first time and I am impressed. Clean car, transparent pricing, and quick support.', created_at: null },
  ]

  const items = reviews.length > 0 ? reviews : (loading ? [] : fallback)

  return (
    <section className="px-4 py-20 overflow-hidden">
      <div className="mx-auto max-w-7xl">
        <SectionTitle title="What our customers say" subtitle="Real reviews from verified trips across India" />
        {loading ? (
          <div className="mt-10 flex gap-5 overflow-x-auto pb-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-52 w-80 shrink-0 animate-pulse rounded-lg bg-zinc-100" />
            ))}
          </div>
        ) : (
          <div
            className="mt-10 flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory scroll-smooth"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#e31837 #f4f4f5' }}
          >
            {items.map((review, i) => (
              <ReviewSlide key={review._id || review.id || i} review={review} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function ReviewSlide({ review }) {
  const name = review.reviewer_name || 'SigFleet User'
  const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
  const body = review.body || ''
  const short = body.length > 180 ? `${body.slice(0, 180)}…` : body
  const carTitle = review.car_snapshot?.title || ''

  return (
    <article className="w-80 shrink-0 snap-start rounded-lg border border-zinc-200 bg-white p-6 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex gap-0.5 mb-3">
          {[1,2,3,4,5].map((s) => (
            <Star key={s} size={16} className={s <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-200'} />
          ))}
        </div>
        {review.title && <p className="font-black text-zinc-950 mb-2">{review.title}</p>}
        <p className="text-sm font-medium leading-relaxed text-zinc-600">"{short}"</p>
      </div>
      <div className="mt-5 flex items-center gap-3 border-t border-zinc-100 pt-4">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#E31837] text-xs font-black text-white">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate font-black text-sm text-zinc-950">{name}</p>
          {carTitle && <p className="truncate text-xs font-bold text-zinc-400">{carTitle}</p>}
        </div>
      </div>
    </article>
  )
}

function HomeFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-[#111827] text-white px-4 pt-16 pb-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <p className="text-2xl font-black"><span className="text-[#E31837]">Sig</span>Fleet</p>
            <p className="mt-3 text-sm font-medium leading-relaxed text-zinc-400">
              India's self-drive vehicle rental platform. Verified managers, transparent pricing, and comprehensive insurance across 8+ cities.
            </p>
            <div className="mt-5 flex gap-3">
              <a href="/vehicles" className="rounded-md bg-[#E31837] px-4 py-2 text-sm font-black text-white hover:bg-red-700 transition">Browse Cars</a>
              <a href="/auth/register" className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-black text-zinc-300 hover:border-zinc-500 transition">Become a Manager</a>
            </div>
          </div>

          {/* Quick links */}
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-4">Quick Links</p>
            <ul className="space-y-3 text-sm font-semibold text-zinc-400">
              {[['/', 'Home'], ['/vehicles', 'Browse Vehicles'], ['/how-it-works', 'How It Works'], ['/safety', 'Safety'], ['/insurance', 'Insurance'], ['/about', 'About Us']].map(([href, label]) => (
                <li key={href}><a href={href} className="hover:text-white transition">{label}</a></li>
              ))}
            </ul>
          </div>

          {/* Cities */}
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-4">Cities</p>
            <ul className="space-y-3 text-sm font-semibold text-zinc-400">
              {['Bengaluru', 'Mumbai', 'Delhi', 'Chennai', 'Pune', 'Hyderabad', 'Goa', 'Jaipur'].map((c) => (
                <li key={c}><a href={`/vehicles?city=${c}`} className="hover:text-white transition">{c}</a></li>
              ))}
            </ul>
          </div>

          {/* Support & Legal */}
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-4">Support & Legal</p>
            <ul className="space-y-3 text-sm font-semibold text-zinc-400">
              {[['/contact', 'Contact Support'], ['/terms', 'Terms of Service'], ['/privacy', 'Privacy Policy'], ['/refund-policy', 'Refund Policy']].map(([href, label]) => (
                <li key={href}><a href={href} className="hover:text-white transition">{label}</a></li>
              ))}
            </ul>
            <div className="mt-6 rounded-lg bg-zinc-900 p-4">
              <p className="text-xs font-black text-zinc-500 uppercase tracking-wider mb-1">24/7 Support</p>
              <p className="text-sm font-bold text-zinc-300">support@sigfleet.com</p>
              <p className="mt-1 text-sm font-bold text-zinc-300">+91 98765 43210</p>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-zinc-800 pt-6">
          <p className="text-sm font-semibold text-zinc-500">© {new Date().getFullYear()} SigFleet. All rights reserved.</p>
          <div className="flex gap-5 text-sm font-semibold text-zinc-500">
            <a href="/terms" className="hover:text-white transition">Terms</a>
            <a href="/privacy" className="hover:text-white transition">Privacy</a>
            <a href="/refund-policy" className="hover:text-white transition">Refunds</a>
          </div>
        </div>
      </div>
    </footer>
  )
}

function FAQ() {
  const questions = [
    ['How does the booking process work?', 'Search by city and dates, choose a verified car, complete your profile and KYC, then pay securely. The manager confirms the trip and shares pickup instructions.'],
    ['What documents do I need to book a car?', 'You need a verified account, a valid driving license, Aadhaar details, and a phone number reachable during the trip.'],
    ['What happens if I return the car late?', 'Late returns may attract hourly charges and can affect the next customer booking. You can request an extension from your booking screen when available.'],
    ['Can I extend my trip while on the go?', 'Yes. Open the active booking, choose a new return time, and wait for manager approval. Any extra amount is collected before confirmation.'],
    ['Is insurance mandatory?', 'Yes. Every booking includes an insurance selection so customers and managers know the damage-liability limit before pickup.'],
    ['How do managers get paid?', 'Manager earnings are credited after successful trip completion. Managers can request payouts to a verified bank account from the manager dashboard.'],
  ]
  return <section className="bg-white px-4 py-20"><div className="mx-auto max-w-3xl"><SectionTitle title="Frequently asked questions" /><Accordion.Root type="single" collapsible className="mt-8 space-y-3">{questions.map(([q, a]) => <Accordion.Item key={q} value={q} className="rounded-lg border border-zinc-200 bg-white px-5"><Accordion.Trigger className="flex w-full items-center justify-between py-4 text-left font-semibold">{q}<ChevronDown size={18} /></Accordion.Trigger><Accordion.Content className="pb-4 font-normal leading-relaxed text-zinc-600">{a}</Accordion.Content></Accordion.Item>)}</Accordion.Root></div></section>
}

const customerSteps = [
  { title: 'Search & Book', text: 'Find the perfect car in seconds. Filter by city, date, and type.' },
  { title: 'Pick Up Your Vehicle', text: 'Meet your manager, complete a quick inspection, and get the keys.' },
  { title: 'Drive & Return', text: "Drive anywhere you want, return on time, and you're done." },
]
const managerSteps = [
  { title: 'Become a Manager Free', text: 'Add your car in 10 minutes. No subscription fees ever.' },
  { title: 'Get Bookings', text: 'Customers find your car, book, and pay. You approve each trip.' },
  { title: 'Earn Weekly', text: 'Earn ₹15,000–₹40,000/month. Instant payouts after each trip.' },
]
const trust = [
  { icon: ShieldCheck, title: 'KYC Verified Customers', text: 'Every customer is identity-verified before booking.' },
  { icon: ShieldCheck, title: 'Comprehensive Insurance', text: 'Choose from Basic, Standard, or Platinum coverage.' },
  { icon: Star, title: '24/7 Support', text: 'Round-the-clock assistance for customers and managers.' },
  { icon: WalletCards, title: 'Secure Payments', text: 'Your money is safe with our simulated escrow system.' },
]
