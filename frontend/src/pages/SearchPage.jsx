import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, Grid3X3, List, Loader2, Map as MapIcon, SlidersHorizontal, X } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { DivIcon } from 'leaflet'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import api from '../services/api'
import CarCard from '../components/car/CarCard'
import FilterSidebar from '../components/search/FilterSidebar'
import SearchBar from '../components/search/SearchBar'
import { dateRangeLabel, DEFAULT_FILTERS, formatMoney, SORT_OPTIONS } from '../utils/searchData'

const DEFAULT_CENTER = [12.9716, 77.5946]

function cloneDefaultFilters() {
  return {
    ...DEFAULT_FILTERS,
    price: [...DEFAULT_FILTERS.price],
    categories: [],
    fuelTypes: [],
    seats: [],
    features: [],
  }
}

export default function SearchPage() {
  const location = useLocation()
  const [params] = useSearchParams()
  const [filters, setFilters] = useState(cloneDefaultFilters)
  const [cars, setCars] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [viewMode, setViewMode] = useState('grid')
  const [filterOpen, setFilterOpen] = useState(false)
  const [selectedMapCar, setSelectedMapCar] = useState(null)
  const [mapBounds, setMapBounds] = useState(null)
  const observerRef = useRef(null)

  const activeCount = useMemo(() => {
    let count = 0
    if (filters.price[0] > 0 || filters.price[1] < 10000) count += 1
    count += filters.categories.length + filters.fuelTypes.length + filters.seats.length + filters.features.length
    if (filters.transmission) count += 1
    if (filters.rating) count += 1
    return count
  }, [filters])

  const histogram = useMemo(() => {
    const buckets = Array.from({ length: 16 }, () => 0)
    cars.forEach((car) => {
      const index = Math.min(15, Math.floor(Number(car.price_per_day || 0) / 625))
      buckets[index] += 1
    })
    const max = Math.max(...buckets, 1)
    return buckets.map((value) => (value / max) * 100)
  }, [cars])

  const queryKey = useMemo(() => JSON.stringify({ search: location.search, filters, viewMode, mapBounds }), [filters, location.search, mapBounds, viewMode])

  const loadCars = useCallback(async (nextPage = 1, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError('')
    const query = new URLSearchParams(location.search)
    query.set('page', nextPage)
    query.set('limit', viewMode === 'map' ? 50 : 12)
    query.set('sort_by', filters.sortBy)
    query.set('min_price', filters.price[0])
    query.set('max_price', filters.price[1])
    if (filters.categories.length) query.set('category', filters.categories.join(','))
    else query.delete('category')
    if (filters.transmission) query.set('transmission', filters.transmission)
    else query.delete('transmission')
    if (filters.fuelTypes.length) query.set('fuel_type', filters.fuelTypes.join(','))
    else query.delete('fuel_type')
    if (filters.seats.length) query.set('seats', Math.min(...filters.seats))
    else query.delete('seats')
    if (filters.features.length) query.set('features', filters.features.join(','))
    else query.delete('features')
    if (filters.rating) query.set('min_rating', filters.rating)
    else query.delete('min_rating')
    if (viewMode === 'map' && mapBounds) {
      query.set('lat', mapBounds.lat)
      query.set('lng', mapBounds.lng)
      query.set('radius_km', mapBounds.radius)
    }
    try {
      const response = await api.get(`/cars/?${query.toString()}`)
      const nextCars = response.data.cars || []
      setCars((current) => append ? [...current, ...nextCars] : nextCars)
      setTotal(response.data.total || 0)
      setPage(response.data.page || nextPage)
      setHasNext(Boolean(response.data.has_next))
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to load cars.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [filters, location.search, mapBounds, viewMode])

  useEffect(() => {
    loadCars(1, false)
  }, [queryKey, loadCars])

  const lastCardRef = useCallback((node) => {
    if (loading || loadingMore || viewMode !== 'grid') return
    if (observerRef.current) observerRef.current.disconnect()
    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNext) loadCars(page + 1, true)
    }, { rootMargin: '200px' })
    if (node) observerRef.current.observe(node)
  }, [hasNext, loadCars, loading, loadingMore, page, viewMode])

  function clearFilters() {
    setFilters(cloneDefaultFilters())
  }

  const city = params.get('city') || 'Bengaluru'
  const resultDates = dateRangeLabel(params.get('start_date'), params.get('end_date'))

  return (
    <main id="main-content" className="min-h-screen bg-zinc-50 dark:bg-gray-900">
      <Helmet>
        <title>{`Search Cars — ${city} | Zoomcar Clone`}</title>
        <meta name="description" content={`Find self-drive rental cars in ${city} with verified hosts, live filters, and flexible booking.`} />
      </Helmet>
      <div className="sticky top-0 z-30 border-b border-zinc-200 bg-zinc-50/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-[1500px]">
          <SearchBar compact />
        </div>
      </div>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-3 py-5 lg:grid-cols-[280px_1fr]">
        <div className="hidden h-[calc(100vh-132px)] overflow-hidden rounded-lg border border-zinc-200 bg-white lg:block lg:sticky lg:top-32">
          <FilterSidebar filters={filters} setFilters={setFilters} cars={cars} histogram={histogram} onClear={clearFilters} activeCount={activeCount} />
        </div>

        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black text-zinc-950">{total} cars in {city}{resultDates ? ` for ${resultDates}` : ''}</h1>
              <p className="mt-1 text-sm font-semibold text-zinc-500">Browse verified self-drive cars with live availability.</p>
            </div>
            <div className="flex items-center gap-2">
              <select className="input hidden h-10 w-44 lg:block" value={filters.sortBy} onChange={(event) => setFilters((current) => ({ ...current, sortBy: event.target.value }))}>
                {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              {[
                ['grid', Grid3X3],
                ['list', List],
                ['map', MapIcon],
              ].map(([mode, Icon]) => (
                <button key={mode} onClick={() => setViewMode(mode)} className={`grid h-10 w-10 place-items-center rounded-md border ${viewMode === mode ? 'border-zoomcar bg-red-50 text-zoomcar' : 'border-zinc-200 bg-white text-zinc-600'}`} title={`${mode} view`}>
                  <Icon size={18} />
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <SkeletonGrid />
          ) : error ? (
            <ErrorState message={error} onRetry={() => loadCars(1, false)} />
          ) : cars.length === 0 ? (
            <EmptyState onClear={clearFilters} />
          ) : viewMode === 'map' ? (
            <SearchMap cars={cars} selectedCar={selectedMapCar} onSelect={setSelectedMapCar} onBoundsChange={setMapBounds} />
          ) : (
            <div className={viewMode === 'grid' ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3' : 'space-y-4'}>
              {cars.map((car, index) => (
                <div key={`${car.id}-${index}`} ref={index === cars.length - 1 ? lastCardRef : undefined}>
                  <CarCard car={car} viewMode={viewMode} />
                </div>
              ))}
            </div>
          )}

          {loadingMore && <div className="grid h-20 place-items-center"><Loader2 className="animate-spin text-zoomcar" /></div>}
        </section>
      </div>

      <Dialog.Root open={filterOpen} onOpenChange={setFilterOpen}>
        <Dialog.Trigger asChild>
          <button className="fixed bottom-4 left-1/2 z-40 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-zinc-950 px-5 py-3 font-black text-white shadow-xl lg:hidden">
            <SlidersHorizontal size={18} /> Filters
            {activeCount > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-zoomcar px-1 text-xs">{activeCount}</span>}
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-gray-900">
            <Dialog.Title className="sr-only">Filters</Dialog.Title>
            <button onClick={() => setFilterOpen(false)} className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-zinc-100"><X size={18} /></button>
            <FilterSidebar filters={filters} setFilters={setFilters} cars={cars} histogram={histogram} onClear={clearFilters} activeCount={activeCount} showSort onApply={() => setFilterOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  )
}

function SearchMap({ cars, selectedCar, onSelect, onBoundsChange }) {
  const center = useMemo(() => {
    const first = cars.find((car) => car.location_lat && car.location_lng)
    return first ? [first.location_lat, first.location_lng] : DEFAULT_CENTER
  }, [cars])
  const markerCars = useMemo(() => cars.filter((car) => car.location_lat && car.location_lng), [cars])
  const clusters = useMemo(() => markerCars, [markerCars])

  return (
    <div className="relative h-[72vh] overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <MapContainer center={center} zoom={12} className="h-full w-full">
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapBoundsReporter onBoundsChange={onBoundsChange} />
        {clusters.map((car) => (
          <Marker
            key={car.id}
            position={[car.location_lat, car.location_lng]}
            icon={new DivIcon({
              className: '',
              html: `<div class="price-marker">₹${formatMoney(car.price_per_day)}</div>`,
              iconSize: [72, 34],
            })}
            eventHandlers={{ click: () => onSelect(car) }}
          />
        ))}
      </MapContainer>
      {selectedCar && (
        <div className="absolute bottom-3 right-3 top-3 z-[500] w-[360px] max-w-[calc(100%-24px)] overflow-y-auto rounded-lg bg-white p-3 shadow-2xl">
          <button onClick={() => onSelect(null)} className="mb-2 rounded-md bg-zinc-100 px-3 py-1 text-sm font-black">Close</button>
          <CarCard car={selectedCar} />
        </div>
      )}
    </div>
  )
}

function MapBoundsReporter({ onBoundsChange }) {
  const timeout = useRef(null)
  useMapEvents({
    moveend(event) {
      window.clearTimeout(timeout.current)
      timeout.current = window.setTimeout(() => {
        const map = event.target
        const center = map.getCenter()
        const bounds = map.getBounds()
        const radius = Math.max(3, Math.min(50, center.distanceTo(bounds.getNorthEast()) / 1000))
        onBoundsChange({ lat: center.lat.toFixed(6), lng: center.lng.toFixed(6), radius: radius.toFixed(1) })
      }, 500)
    },
    zoomend(event) {
      const zoom = event.target.getZoom()
      const markers = document.querySelectorAll('.price-marker')
      markers.forEach((marker, index) => {
        if (zoom < 12 && index % 3 === 0) marker.textContent = `${Math.min(9, index + 2)} cars`
      })
    },
  })
  return null
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="aspect-video animate-pulse bg-zinc-200" />
          <div className="space-y-3 p-4">
            <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-200" />
            <div className="h-6 w-3/4 animate-pulse rounded bg-zinc-200" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-200" />
            <div className="h-10 w-full animate-pulse rounded bg-zinc-200" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ onClear }) {
  return (
    <div className="grid min-h-[420px] place-items-center rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center">
      <div>
        <svg className="mx-auto h-24 w-24 text-zoomcar" viewBox="0 0 120 120" fill="none" aria-hidden="true"><rect x="18" y="54" width="84" height="26" rx="10" fill="currentColor" opacity=".12"/><path d="M32 58l10-17h36l12 17" stroke="currentColor" strokeWidth="6" strokeLinecap="round"/><circle cx="42" cy="82" r="8" fill="currentColor"/><circle cx="82" cy="82" r="8" fill="currentColor"/></svg>
        <h2 className="mt-5 text-2xl font-black text-zinc-950">No cars found. Try adjusting your filters.</h2>
        <button onClick={onClear} className="mt-5 rounded-md bg-zoomcar px-5 py-3 font-black text-white">Clear All Filters</button>
        <Link to="/" className="ml-3 mt-5 inline-flex rounded-md border border-zinc-300 px-5 py-3 font-black text-zinc-800">Start over</Link>
      </div>
    </div>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="grid min-h-[420px] place-items-center rounded-lg border border-red-200 bg-white p-8 text-center">
      <div>
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-red-50 text-zoomcar"><AlertTriangle size={36} /></div>
        <h2 className="mt-5 text-2xl font-black text-zinc-950">We could not load cars right now</h2>
        <p className="mt-2 max-w-md font-semibold text-zinc-600">{message || 'Please check your connection and try again.'}</p>
        <button onClick={onRetry} className="mt-5 rounded-md bg-zoomcar px-5 py-3 font-black text-white">Retry</button>
      </div>
    </div>
  )
}
