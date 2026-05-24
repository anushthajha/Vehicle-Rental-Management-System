import React, { useEffect, useMemo, useState } from 'react'
import * as Accordion from '@radix-ui/react-accordion'
import { motion, useInView } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { ArrowRight, CalendarDays, Car, ChevronDown, MapPin, Search, ShieldCheck, Star, WalletCards } from 'lucide-react'
import { Autoplay } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/react'
import 'swiper/css'
import api from '../services/api'
import Navbar from '../components/layout/Navbar'
import VehicleCard from '../components/vehicle/VehicleCard'
import { useVehicleCategories } from '../hooks/useVehicleCategories'

const cities = ['Bengaluru', 'Mumbai', 'Delhi', 'Pune', 'Chennai', 'Goa', 'Hyderabad', 'Jaipur']
const cityImages = {
  Bengaluru: 'https://images.unsplash.com/photo-1596176530529-78163a4f7af2?w=600',
  Mumbai: 'https://images.unsplash.com/photo-1595658658481-d53d3f999875?w=600',
  Delhi: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=600',
  Pune: 'https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=600',
  Chennai: 'https://images.unsplash.com/photo-1582510003544-4d00b7f74220?w=600',
  Hyderabad: 'https://images.unsplash.com/photo-1545431781-3e1b506e9a37?w=600',
  Jaipur: 'https://images.unsplash.com/photo-1477587458883-47145ed68d72?w=600',
  Goa: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=600',
}
const rates = { hatchback: 550, sedan: 750, suv: 1050, luxury: 2500, electric: 850 }

export default function HomePage() {
  const [city, setCity] = useState('Bengaluru')
  const [pickup, setPickup] = useState('')
  const [dropoff, setDropoff] = useState('')
  const [tab, setTab] = useState('guest')
  const [featured, setFeatured] = useState([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(15)
  const [category, setCategory] = useState('sedan')
  const { categories } = useVehicleCategories()
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/vehicles/featured', { params: { limit: 6 } }).then((response) => setFeatured(response.data.cars || response.data || [])).catch(() => setFeatured([])).finally(() => setLoading(false))
  }, [])

  const estimated = Math.round(days * rates[category] * 0.85)
  const search = () => navigate(`/vehicles?city=${encodeURIComponent(city)}${pickup ? `&pickup_date=${encodeURIComponent(new Date(pickup).toISOString())}` : ''}${dropoff ? `&return_date=${encodeURIComponent(new Date(dropoff).toISOString())}` : ''}`)

  return (
    <main id="main-content" className="bg-[#F9FAFB] text-[#111827] dark:bg-gray-900 dark:text-gray-100">
      <Helmet>
        <title>SigFleet — Self-Drive Car Rentals</title>
        <meta name="description" content="Rent self-drive cars across 100+ Indian cities. Verified managers, comprehensive insurance, instant booking." />
      </Helmet>
      <Navbar />
      <section className="relative min-h-[92vh] overflow-hidden bg-[#111827]">
        <img src="https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=1920" alt="Self-drive car on an open road" loading="eager" decoding="async" width="1920" height="1080" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/55 to-[#E31837]/35" />
        <div className="relative mx-auto flex min-h-[92vh] max-w-7xl flex-col justify-center px-4 pb-16 pt-32 text-white">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="max-w-4xl">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-orange-200">India's #1 Self-Drive Platform</p>
            <h1 className="font-display mt-4 text-5xl font-black leading-tight md:text-7xl">Drive on your own terms</h1>
            <p className="mt-5 max-w-2xl text-lg font-semibold text-white/85 md:text-2xl">Choose from 25,000+ verified cars across 100+ cities. No driver, no hassle.</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15 }} className="mt-10 max-w-3xl rounded-lg border border-white/25 bg-white/15 p-4 shadow-2xl backdrop-blur-xl">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
              <label className="rounded-md bg-white/95 p-3 text-[#111827]"><span className="text-xs font-black uppercase text-zinc-500">City</span><div className="mt-1 flex items-center gap-2"><MapPin size={17} className="text-[#E31837]" /><select value={city} onChange={(event) => setCity(event.target.value)} className="w-full bg-transparent font-black outline-none">{cities.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={16} /></div></label>
              <label className="rounded-md bg-white/95 p-3 text-[#111827]"><span className="text-xs font-black uppercase text-zinc-500">Pickup</span><div className="mt-1 flex items-center gap-2"><CalendarDays size={17} className="text-[#E31837]" /><input type="datetime-local" value={pickup} onChange={(event) => setPickup(event.target.value)} className="w-full bg-transparent text-sm font-black outline-none" /></div></label>
              <label className="rounded-md bg-white/95 p-3 text-[#111827]"><span className="text-xs font-black uppercase text-zinc-500">Return</span><div className="mt-1 flex items-center gap-2"><CalendarDays size={17} className="text-[#E31837]" /><input type="datetime-local" value={dropoff} onChange={(event) => setDropoff(event.target.value)} className="w-full bg-transparent text-sm font-black outline-none" /></div></label>
              <button onClick={search} className="shine-hover relative overflow-hidden rounded-md bg-[#E31837] px-6 py-4 font-black text-white"><span className="relative flex items-center justify-center gap-2">Search <ArrowRight size={18} /></span></button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">{cities.map((item) => <button key={item} onClick={() => setCity(item)} className={`rounded-full px-3 py-1.5 text-xs font-black ${city === item ? 'bg-[#E31837] text-white' : 'bg-white/20 text-white hover:bg-white/30'}`}>{item}</button>)}</div>
          </motion.div>
        </div>
      </section>
      <StatsStrip />
      <section id="how" className="bg-white px-4 py-20"><div className="mx-auto max-w-7xl"><SectionTitle eyebrow="How it works" title="Simple for every kind of driver" /><div className="mx-auto mt-8 flex w-fit rounded-full bg-zinc-100 p-1">{[['guest', 'For Guests'], ['manager', 'For Managers']].map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`rounded-full px-5 py-2 text-sm font-black ${tab === key ? 'bg-[#E31837] text-white' : 'text-zinc-700'}`}>{label}</button>)}</div><div className="mt-10 grid gap-5 md:grid-cols-3">{(tab === 'guest' ? guestSteps : managerSteps).map((step, index) => <StepCard key={step.title} index={index + 1} {...step} />)}</div></div></section>
      <section className="px-4 py-20"><div className="mx-auto max-w-7xl"><SectionTitle title="Find your perfect ride" /><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{categories.map((cat) => <Link key={cat.id} to={`/vehicles?category_id=${cat.id}`} className="group rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"><Car className="text-[#E31837]" size={34} /><h3 className="mt-5 font-display text-xl font-black">{cat.name}</h3><p className="mt-2 text-sm font-bold text-zinc-500">{cat.vehicle_count || 0} vehicles</p><span className="mt-4 inline-flex border-b-2 border-transparent pb-1 text-sm font-black text-[#E31837] transition group-hover:border-[#E31837]">Browse <ArrowRight size={15} className="ml-1" /></span></Link>)}</div></div></section>
      <section className="bg-white px-4 py-20"><div className="mx-auto max-w-7xl"><SectionTitle title="Top picks near you" subtitle="Hand-picked, highly-rated cars by verified managers" /><div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{loading ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-80 animate-pulse rounded-lg bg-zinc-100" />) : featured.slice(0, 6).map((car) => <VehicleCard key={car.id} car={car} />)}</div><Link to={`/vehicles?city=${city}`} className="mt-8 inline-flex font-black text-[#E31837]">View all cars in your city <ArrowRight className="ml-1" size={18} /></Link></div></section>
      <section className="px-4 py-20"><div className="mx-auto max-w-7xl"><SectionTitle title="Explore India, your way" /><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cities.map((item, index) => <Link key={item} to={`/cities/${item.toLowerCase()}`} className="group relative h-56 overflow-hidden rounded-lg bg-zinc-900 shadow-sm"><img src={cityImages[item]} alt={`${item} city destination`} loading="lazy" decoding="async" width="600" height="400" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /><div className="absolute inset-0 bg-black/45 transition group-hover:bg-black/25" /><div className="absolute inset-x-0 bottom-0 p-5 text-white"><h3 className="font-display text-2xl font-black">{item}</h3><p className="mt-1 font-bold">{180 + index * 37} cars</p></div></Link>)}</div></div></section>
      <section className="bg-zinc-100 px-4 py-20"><div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_1fr] lg:items-center"><div><SectionTitle align="left" title="How much can you earn?" subtitle="Estimate monthly take-home earnings from sharing your car." /><Link to="/contact" className="mt-8 inline-flex rounded-md bg-[#E31837] px-5 py-3 font-black text-white">Become a Manager Free <ArrowRight className="ml-2" size={18} /></Link></div><div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"><label className="font-black">Days per month I can share my car: {days}</label><input type="range" min="5" max="25" value={days} onChange={(event) => setDays(Number(event.target.value))} className="mt-4 w-full accent-[#E31837]" /><label className="mt-5 block font-black">My car category:<select value={category} onChange={(event) => setCategory(event.target.value)} className="input mt-2">{Object.keys(rates).map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label><div className="mt-6 rounded-lg bg-[#111827] p-5 text-white"><p className="text-sm font-bold text-white/70">Estimated monthly earnings</p><p className="font-display mt-1 text-4xl font-black">₹{estimated.toLocaleString('en-IN')}</p><p className="mt-2 text-sm font-bold text-white/70">Manager 10M+ guests have already earned with SigFleet</p></div></div></div></section>
      <section className="bg-white px-4 py-20"><div className="mx-auto max-w-7xl"><div className="grid gap-4 md:grid-cols-4">{trust.map((item) => { const Icon = item.icon; return <div key={item.title} className="rounded-lg border border-zinc-200 p-5"><Icon className="text-[#E31837]" /><h3 className="mt-4 font-black">{item.title}</h3><p className="mt-2 text-sm font-semibold text-zinc-600">{item.text}</p></div> })}</div></div></section>
      <Testimonials />
      <FAQ />
      <section className="px-4 pb-20"><div className="mx-auto grid max-w-7xl gap-5 overflow-hidden rounded-lg bg-gradient-to-r from-[#E31837] to-[#FF6B35] p-8 text-white md:grid-cols-[1fr_auto] md:items-center"><div><h2 className="font-display text-3xl font-black">Drive smarter with the SigFleet app</h2><p className="mt-2 font-semibold text-white/85">Book, unlock, extend, and get support from your pocket.</p></div><div className="flex flex-wrap gap-3"><StoreBadge label="App Store" /><StoreBadge label="Google Play" /></div></div></section>
    </main>
  )
}

function StatsStrip() {
  const ref = React.useRef(null)
  const visible = useInView(ref, { once: true, margin: '-80px' })
  return <section ref={ref} className="relative z-10 -mt-10 px-4"><div className="mx-auto grid max-w-6xl gap-3 rounded-lg bg-white p-5 shadow-xl md:grid-cols-4">{[['10M+', 'Trips'], ['25,000+', 'Cars'], ['100+', 'Cities'], ['4.8', 'Avg Rating']].map(([num, label]) => <div key={label} className="text-center"><motion.p initial={{ opacity: 0, y: 10 }} animate={visible ? { opacity: 1, y: 0 } : {}} className="font-display text-3xl font-black text-[#E31837]">{num}</motion.p><p className="font-bold text-zinc-500">{label}</p></div>)}</div></section>
}

function SectionTitle({ eyebrow, title, subtitle, align = 'center' }) {
  return <div className={align === 'center' ? 'text-center' : ''}>{eyebrow && <p className="text-sm font-black uppercase tracking-[0.2em] text-[#E31837]">{eyebrow}</p>}<h2 className="font-display text-3xl font-black md:text-5xl">{title}</h2>{subtitle && <p className="mx-auto mt-3 max-w-2xl text-lg font-semibold text-zinc-600">{subtitle}</p>}</div>
}

function StepCard({ index, title, text }) {
  return <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"><span className="grid h-12 w-12 place-items-center rounded-full bg-[#E31837] font-display text-xl font-black text-white">{index}</span><h3 className="mt-5 font-display text-xl font-black">{title}</h3><p className="mt-2 font-semibold text-zinc-600">{text}</p></div>
}

function Testimonials() {
  const items = [
    ['Booked a Creta for our Coorg trip — manager was amazing and car was spotless.', 'Radhika M., Bengaluru'],
    ['Easy booking, clean car, smooth pickup. Way better than cabs for road trips!', 'Aryan K., Mumbai'],
    ['The Thar we rented for Leh was perfect. Highly recommend SigFleet!', 'Priya S., Delhi'],
  ]
  return <section className="px-4 py-20"><div className="mx-auto max-w-7xl"><SectionTitle title="What our guests say" /><Swiper modules={[Autoplay]} autoplay={{ delay: 4000 }} loop spaceBetween={20} breakpoints={{ 768: { slidesPerView: 2 }, 1024: { slidesPerView: 3 } }} className="mt-10">{items.map(([quote, name]) => <SwiperSlide key={name}><div className="h-full rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"><p className="text-amber-400">★★★★★</p><p className="mt-4 text-lg font-bold">"{quote}"</p><p className="mt-5 font-black text-[#E31837]">— {name}</p></div></SwiperSlide>)}</Swiper></div></section>
}

function FAQ() {
  const questions = [
    ['How does the booking process work?', 'Search by city and dates, choose a verified car, complete your profile and KYC, then pay securely. The manager confirms the trip and shares pickup instructions.'],
    ['What documents do I need to book a car?', 'You need a verified account, a valid driving license, Aadhaar details, and a phone number reachable during the trip.'],
    ['What happens if I return the car late?', 'Late returns may attract hourly charges and can affect the next guest booking. You can request an extension from your booking screen when available.'],
    ['Can I extend my trip while on the go?', 'Yes. Open the active booking, choose a new return time, and wait for manager approval. Any extra amount is collected before confirmation.'],
    ['Is insurance mandatory?', 'Yes. Every booking includes an insurance selection so guests and managers know the damage-liability limit before pickup.'],
    ['How do managers get paid?', 'Manager earnings are credited after successful trip completion. Managers can request payouts to a verified bank account from the manager dashboard.'],
  ]
  return <section className="bg-white px-4 py-20"><div className="mx-auto max-w-3xl"><SectionTitle title="Frequently asked questions" /><Accordion.Root type="single" collapsible className="mt-8 space-y-3">{questions.map(([q, a]) => <Accordion.Item key={q} value={q} className="rounded-lg border border-zinc-200 bg-white px-5"><Accordion.Trigger className="flex w-full items-center justify-between py-4 text-left font-black">{q}<ChevronDown size={18} /></Accordion.Trigger><Accordion.Content className="pb-4 font-semibold text-zinc-600">{a}</Accordion.Content></Accordion.Item>)}</Accordion.Root></div></section>
}

function StoreBadge({ label }) {
  return <div className="rounded-md bg-black px-5 py-3 text-white shadow"><p className="text-xs font-bold leading-none">Download on</p><p className="font-display text-lg font-black leading-tight">{label}</p></div>
}

const guestSteps = [
  { title: 'Search & Book', text: 'Find the perfect car in seconds. Filter by city, date, and type.' },
  { title: 'Pick Up Your Car', text: 'Meet your manager, complete a quick inspection, and get the keys.' },
  { title: 'Drive & Return', text: "Drive anywhere you want, return on time, and you're done." },
]
const managerSteps = [
  { title: 'Become a Manager Free', text: 'Add your car in 10 minutes. No subscription fees ever.' },
  { title: 'Get Bookings', text: 'Guests find your car, book, and pay. You approve each trip.' },
  { title: 'Earn Weekly', text: 'Earn ₹15,000–₹40,000/month. Instant payouts after each trip.' },
]
const trust = [
  { icon: ShieldCheck, title: 'KYC Verified Guests', text: 'Every guest is identity-verified before booking.' },
  { icon: ShieldCheck, title: 'Comprehensive Insurance', text: 'Choose from Basic, Standard, or Platinum coverage.' },
  { icon: Star, title: '24/7 Support', text: 'Round-the-clock assistance for guests and managers.' },
  { icon: WalletCards, title: 'Secure Payments', text: 'Your money is safe with our simulated escrow system.' },
]
