import React, { memo, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Armchair, Fuel, Heart, MapPin, Music, Snowflake, Star, Zap } from 'lucide-react'
import api from '../../services/api'
import { useAuthStore } from '../../context/AuthContext'
import { formatMoney } from '../../utils/searchData'
import { isLocallySaved, removeLocalWishlistCar, saveLocalWishlistCar } from '../../utils/wishlist'

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=900&q=80'
const CATEGORY_STYLES = {
  suv: 'bg-emerald-100 text-emerald-700',
  luxury: 'bg-amber-100 text-amber-800',
  electric: 'bg-teal-100 text-teal-700',
}

function titleCase(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function CarCard({ car, viewMode = 'grid', onRemoved }) {
  const { user } = useAuthStore()
  const [saved, setSaved] = useState(Boolean(car.is_saved || isLocallySaved(car.id)))
  const image = car.primary_image_url || car.images?.[0]?.image_url || FALLBACK_IMAGE
  const featureLabels = useMemo(() => (car.features || []).map(titleCase), [car.features])

  useEffect(() => {
    setSaved(Boolean(car.is_saved || isLocallySaved(car.id)))
  }, [car])

  async function toggleWishlist(event) {
    event.preventDefault()
    event.stopPropagation()
    const next = !saved
    setSaved(next)
    try {
      if (user) {
        if (next) await api.post('/wishlist/', { car_id: car.id })
        else await api.delete(`/wishlist/${car.id}`)
      } else if (next) {
        saveLocalWishlistCar(car)
      } else {
        removeLocalWishlistCar(car.id)
      }
      if (!next && onRemoved) onRemoved(car.id)
    } catch {
      setSaved(!next)
    }
  }

  if (viewMode === 'list') {
    return (
      <article className="group overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
        <Link to={`/cars/${car.id}`} className="grid gap-4 p-3 sm:grid-cols-[200px_1fr_auto]">
          <div className="relative h-48 overflow-hidden rounded-md bg-zinc-100 sm:h-full">
            <img src={image} alt={`${car.title} rental car in ${car.location_city}`} loading="lazy" decoding="async" width="400" height="260" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
            <CategoryBadge category={car.category} />
          </div>
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-black text-zinc-950">{car.title} <span className="text-zinc-500">{car.year}</span></h3>
                <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-zinc-500"><MapPin size={15} /> {car.location_area || 'Central'}, {car.location_city}</p>
              </div>
              <button onClick={toggleWishlist} className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border bg-white ${saved ? 'border-red-200 text-zoomcar' : 'border-zinc-200 text-zinc-500'}`} aria-label="Toggle wishlist">
                <Heart size={18} fill={saved ? 'currentColor' : 'none'} />
              </button>
            </div>
            <RatingLine car={car} />
            <p className="mt-3 line-clamp-2 text-sm leading-6 text-zinc-600">{car.description || 'A clean, city-ready car with flexible pickup and host-managed availability.'}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {featureLabels.concat([titleCase(car.transmission), `${car.seats} Seats`, titleCase(car.fuel_type)]).slice(0, 9).map((feature) => (
                <span key={feature} className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700">{feature}</span>
              ))}
            </div>
          </div>
          <div className="flex flex-row items-center justify-between gap-4 border-t border-zinc-100 pt-3 sm:flex-col sm:items-end sm:border-t-0 sm:pt-0">
            <div className="text-right">
              <p className="text-2xl font-black text-zinc-950">₹{formatMoney(car.price_per_day)}</p>
              <p className="text-xs font-bold text-zinc-500">per day</p>
            </div>
            <span className="rounded-md border border-zoomcar px-5 py-2.5 text-sm font-black text-zoomcar transition group-hover:bg-zoomcar group-hover:text-white">Book Now</span>
          </div>
        </Link>
      </article>
    )
  }

  return (
    <article className="group overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
      <Link to={`/cars/${car.id}`} className="block">
        <div className="relative aspect-video overflow-hidden bg-zinc-100">
          <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-100" />
          <img src={image} alt={`${car.title} rental car in ${car.location_city}`} loading="lazy" decoding="async" width="480" height="270" className="relative h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          <CategoryBadge category={car.category} />
          <button onClick={toggleWishlist} className={`absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white/95 shadow ${saved ? 'text-zoomcar' : 'text-zinc-600'}`} aria-label="Toggle wishlist">
            <Heart size={19} fill={saved ? 'currentColor' : 'none'} />
          </button>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-3 text-sm font-bold text-zinc-600">
            <span className="flex items-center gap-1"><Snowflake size={15} /> AC</span>
            <span>{titleCase(car.transmission)}</span>
            <span className="flex items-center gap-1"><Armchair size={15} /> {car.seats}</span>
            <span className="flex items-center gap-1">{car.fuel_type === 'electric' ? <Zap size={15} /> : <Fuel size={15} />} {titleCase(car.fuel_type)}</span>
          </div>
          <h3 className="mt-3 text-lg font-black text-zinc-950">{car.title} <span className="text-zinc-500">{car.year}</span></h3>
          <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-zinc-500"><MapPin size={15} /> {car.location_area || 'Central'}, {car.location_city}</p>
          <RatingLine car={car} />
          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-2xl font-black text-zinc-950">₹{formatMoney(car.price_per_day)}<span className="text-sm font-bold text-zinc-500">/day</span></p>
            </div>
            <span className="rounded-md border border-zoomcar px-4 py-2 text-sm font-black text-zoomcar transition group-hover:bg-zoomcar group-hover:text-white">Book Now</span>
          </div>
        </div>
      </Link>
    </article>
  )
}

export default memo(CarCard, (prev, next) => (
  prev.car.id === next.car.id
  && prev.viewMode === next.viewMode
  && Boolean(prev.car.is_saved) === Boolean(next.car.is_saved)
))

function CategoryBadge({ category }) {
  return (
    <span className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-black ${CATEGORY_STYLES[category] || 'bg-zinc-900 text-white'}`}>
      {titleCase(category)}
    </span>
  )
}

function RatingLine({ car }) {
  const trips = Number(car.total_trips || 0)
  return (
    <p className="mt-2 flex items-center gap-1 text-sm font-bold text-zinc-700">
      {trips ? (
        <>
          <Star size={15} className="fill-amber-400 text-amber-400" /> {Number(car.average_rating || 0).toFixed(1)} · {trips} trips
        </>
      ) : (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-black text-emerald-700">New</span>
      )}
      {(car.features || []).includes('music') && <Music size={15} className="ml-1 text-zinc-400" />}
    </p>
  )
}
