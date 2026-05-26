import React, { useCallback, useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, Grid3X3, List, Loader2, Map as MapIcon, SlidersHorizontal, X } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { DivIcon } from 'leaflet'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import api from '../services/api'
import VehicleCard from '../components/vehicle/VehicleCard'
import FilterSidebar from '../components/search/FilterSidebar'
import SearchBar from '../components/search/SearchBar'
import { dateRangeLabel, DEFAULT_FILTERS, formatMoney, SORT_OPTIONS } from '../utils/searchData'
import { useAuthStore } from '../context/AuthContext'
import DashboardShell from './user/DashboardShell'

const DEFAULT_CENTER = [12.9716, 77.5946]

function listParam(params, key) {
  return (params.get(key) || '').split(',').filter(Boolean)
}

function filtersFromParams(params) {
  const minPrice = params.get('min_price')
  const maxPrice = params.get('max_price')
  return {
    ...DEFAULT_FILTERS,
    q: params.get('q') || '',
    availability: params.get('availability') === 'false' ? false : true,
    price: [Number(minPrice || 0), Number(maxPrice || 10000)],
    priceTouched: minPrice !== null || maxPrice !== null,
    categories: listParam(params, 'category_id').concat(listParam(params, 'category')),
    vehicleTypes: listParam(params, 'vehicle_type').concat(listParam(params, 'vehicle_type_id')),
    brands: listParam(params, 'brand'),
    transmission: params.get('transmission') || '',
    fuelTypes: listParam(params, 'fuel_type'),
    seats: listParam(params, 'seats').map(Number).filter(Boolean),
    features: listParam(params, 'features'),
    rating: params.get('rating_min') || params.get('min_rating') || '',
    distance: Number(params.get('radius_km') || 25),
    sortBy: params.get('sort_by') || 'recommended',
  }
}

function putList(query, key, values) {
  if (values?.length) query.set(key, values.join(','))
  else query.delete(key)
}

export default function VehicleListingPage() {
  const { user } = useAuthStore()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams])
  const [vehicles, setCars] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(Number(searchParams.get('page') || 1))
  const [pages, setPages] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [viewMode, setViewMode] = useState('grid')
  const [filterOpen, setFilterOpen] = useState(false)
  const [selectedMapCar, setSelectedMapCar] = useState(null)
  const [mapBounds, setMapBounds] = useState(null)
  const [brandsAvailable, setBrandsAvailable] = useState([])
  const [brandCounts, setBrandCounts] = useState({})
  const [priceRange, setPriceRange] = useState({ min: 0, max: 10000 })

  const updateFilters = useCallback((updater) => {
    const current = filtersFromParams(searchParams)
    const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater }
    const query = new URLSearchParams(searchParams)
    if (next.q?.trim()) query.set('q', next.q.trim())
    else query.delete('q')
    query.set('availability', next.availability ? 'true' : 'false')
    putList(query, 'category_id', next.categories)
    query.delete('category')
    putList(query, 'vehicle_type', next.vehicleTypes)
    query.delete('vehicle_type_id')
    putList(query, 'brand', next.brands)
    putList(query, 'fuel_type', next.fuelTypes)
    putList(query, 'seats', next.seats)
    putList(query, 'features', next.features)
    if (next.transmission) query.set('transmission', next.transmission)
    else query.delete('transmission')
    if (next.rating) query.set('rating_min', next.rating)
    else query.delete('rating_min')
    if (next.priceTouched) {
      query.set('min_price', next.price[0])
      query.set('max_price', next.price[1])
    } else {
      query.delete('min_price')
      query.delete('max_price')
    }
    if (next.distance) query.set('radius_km', next.distance)
    if (next.sortBy) query.set('sort_by', next.sortBy)
    query.set('page', '1')
    setSearchParams(query)
  }, [searchParams, setSearchParams])

  const activeCount = useMemo(() => {
    let count = 0
    if (filters.q) count += 1
    if (!filters.availability) count += 1
    if (filters.priceTouched) count += 1
    count += filters.categories.length + filters.vehicleTypes.length + filters.brands.length + filters.fuelTypes.length + filters.seats.length + filters.features.length
    if (filters.transmission) count += 1
    if (filters.rating) count += 1
    return count
  }, [filters])

  const histogram = useMemo(() => {
    const buckets = Array.from({ length: 16 }, () => 0)
    vehicles.forEach((car) => {
      const max = Math.max(priceRange.max, 1)
      const index = Math.min(15, Math.floor((Number(car.price_per_day || 0) / max) * 16))
      buckets[index] += 1
    })
    const peak = Math.max(...buckets, 1)
    return buckets.map((value) => (value / peak) * 100)
  }, [vehicles, priceRange.max])

  const queryKey = useMemo(() => JSON.stringify({ search: location.search, viewMode, mapBounds }), [location.search, mapBounds, viewMode])

  const buildQuery = useCallback((nextPage) => {
    const query = new URLSearchParams(location.search)
    query.set('page', nextPage)
    query.set('limit', viewMode === 'map' ? 50 : 12)
    query.set('sort_by', filters.sortBy)
    query.set('availability', filters.availability ? 'true' : 'false')
    query.delete('min_rating')
    query.delete('start_date')
    query.delete('end_date')
    if (filters.rating) query.set('rating_min', filters.rating)
    if (viewMode === 'map' && mapBounds) {
      query.set('lat', mapBounds.lat)
      query.set('lng', mapBounds.lng)
      query.set('radius_km', mapBounds.radius)
    }
    return query
  }, [filters.availability, filters.rating, filters.sortBy, location.search, mapBounds, viewMode])

  const loadCars = useCallback(async (nextPage = 1, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError('')
    try {
      const response = await api.get(`/vehicles/?${buildQuery(nextPage).toString()}`)
      const nextCars = response.data.vehicles || response.data.vehicles || []
      setCars((current) => append ? [...current, ...nextCars] : nextCars)
      setTotal(response.data.total || 0)
      setPage(response.data.page || nextPage)
      setPages(response.data.pages || 0)
      setHasNext(Boolean(response.data.has_next))
      setBrandsAvailable(response.data.brands_available || [])
      setBrandCounts(response.data.filter_counts?.brands || {})
      setPriceRange(response.data.price_range || { min: 0, max: 10000 })
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to load vehicles.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [buildQuery])

  useEffect(() => {
    loadCars(Number(searchParams.get('page') || 1), false)
  }, [queryKey, loadCars, searchParams])

  function clearFilters() {
    const keep = new URLSearchParams()
    for (const key of ['city', 'pickup_date', 'return_date']) {
      const value = searchParams.get(key)
      if (value) keep.set(key, value)
    }
    keep.set('availability', 'true')
    keep.set('page', '1')
    setSearchParams(keep)
  }

  function goToPage(nextPage) {
    const query = new URLSearchParams(searchParams)
    query.set('page', nextPage)
    setSearchParams(query)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const city = searchParams.get('city') || 'Bengaluru'
  const resultDates = dateRangeLabel(searchParams.get('pickup_date'), searchParams.get('return_date'))
  const firstShown = total ? ((page - 1) * 12) + 1 : 0
  const lastShown = Math.min(page * 12, total)

  const pageContent = (
    <>
      <div className="sticky top-0 z-30 border-b border-zinc-200 bg-zinc-50/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-[1500px]">
          <SearchBar compact />
        </div>
      </div>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-3 py-5 lg:grid-cols-[300px_1fr]">
        <div className="hidden h-[calc(100vh-132px)] overflow-hidden rounded-lg border border-zinc-200 bg-white lg:block lg:sticky lg:top-32">
          <FilterSidebar filters={filters} setFilters={updateFilters} vehicles={vehicles} histogram={histogram} onClear={clearFilters} activeCount={activeCount} total={total} brandsAvailable={brandsAvailable} brandCounts={brandCounts} priceRange={priceRange} />
        </div>

        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black text-zinc-950">{total} vehicles in {city}{resultDates ? ` for ${resultDates}` : ''}</h1>
              <p className="mt-1 text-sm font-semibold text-zinc-500">Showing {firstShown}-{lastShown} of {total} vehicles</p>
            </div>
            <div className="flex items-center gap-2">
              <select className="input hidden h-10 w-44 lg:block" value={filters.sortBy} onChange={(event) => updateFilters({ sortBy: event.target.value })}>
                {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              {[
                ['grid', Grid3X3],
                ['list', List],
                ['map', MapIcon],
              ].map(([mode, Icon]) => (
                <button key={mode} onClick={() => setViewMode(mode)} className={`grid h-10 w-10 place-items-center rounded-md border ${viewMode === mode ? 'border-sigfleet bg-red-50 text-sigfleet' : 'border-zinc-200 bg-white text-zinc-600'}`} title={`${mode} view`}>
                  <Icon size={18} />
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <SkeletonGrid />
          ) : error ? (
            <ErrorState message={error} onRetry={() => loadCars(page, false)} />
          ) : vehicles.length === 0 ? (
            <EmptyState onClear={clearFilters} />
          ) : viewMode === 'map' ? (
            <SearchMap vehicles={vehicles} selectedCar={selectedMapCar} onSelect={setSelectedMapCar} onBoundsChange={setMapBounds} />
          ) : (
            <div className={viewMode === 'grid' ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3' : 'space-y-4'}>
              {vehicles.map((car, index) => (
                <VehicleCard key={`${car.id}-${index}`} car={car} viewMode={viewMode} datesSelected={Boolean(searchParams.get('pickup_date') && searchParams.get('return_date'))} />
              ))}
            </div>
          )}

          {loadingMore && <div className="grid h-20 place-items-center"><Loader2 className="animate-spin text-sigfleet" /></div>}
          {!loading && !error && vehicles.length > 0 && (
            <>
              <div className="mt-6 hidden justify-center gap-2 lg:flex">
                <Pagination page={page} pages={pages} onPage={goToPage} />
              </div>
              {hasNext && (
                <div className="mt-6 grid lg:hidden">
                  <button onClick={() => loadCars(page + 1, true)} disabled={loadingMore} className="rounded-md bg-zinc-950 px-5 py-3 font-black text-white disabled:opacity-60">
                    {loadingMore ? 'Loading...' : 'Load More'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <Dialog.Root open={filterOpen} onOpenChange={setFilterOpen}>
        <Dialog.Trigger asChild>
          <button className="fixed bottom-4 left-1/2 z-40 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-zinc-950 px-5 py-3 font-black text-white shadow-xl lg:hidden">
            <SlidersHorizontal size={18} /> Filters
            {activeCount > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-sigfleet px-1 text-xs">{activeCount}</span>}
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-hidden rounded-t-2xl bg-white shadow-2xl">
            <Dialog.Title className="sr-only">Filters</Dialog.Title>
            <button onClick={() => setFilterOpen(false)} className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-zinc-100"><X size={18} /></button>
            <FilterSidebar filters={filters} setFilters={updateFilters} vehicles={vehicles} histogram={histogram} onClear={clearFilters} activeCount={activeCount} total={total} brandsAvailable={brandsAvailable} brandCounts={brandCounts} priceRange={priceRange} showSort onApply={() => setFilterOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )

  if (user?.role === 'customer') {
    return (
      <DashboardShell title={`Vehicles in ${city}`} eyebrow="Search">
        <Helmet>
          <title>{`Vehicles — ${city} | SigFleet`}</title>
          <meta name="description" content={`Find self-drive rental vehicles in ${city} with exact search filters, availability, and pagination.`} />
        </Helmet>
        {pageContent}
      </DashboardShell>
    )
  }

  return (
    <main id="main-content" className="min-h-screen bg-zinc-50">
      <Helmet>
        <title>{`Vehicles — ${city} | SigFleet`}</title>
        <meta name="description" content={`Find self-drive rental vehicles in ${city} with exact search filters, availability, and pagination.`} />
      </Helmet>
      {pageContent}
    </main>
  )
}

function Pagination({ page, pages, onPage }) {
  const items = Array.from({ length: pages }, (_, index) => index + 1).filter((item) => item === 1 || item === pages || Math.abs(item - page) <= 2)
  let previous = 0
  return (
    <nav className="flex items-center gap-2" aria-label="Vehicle pagination">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-md border border-zinc-300 px-4 py-2 font-black disabled:opacity-40">Prev</button>
      {items.map((item) => {
        const gap = item - previous > 1
        previous = item
        return (
          <React.Fragment key={item}>
            {gap && <span className="px-1 font-black text-zinc-400">...</span>}
            <button onClick={() => onPage(item)} className={`h-10 min-w-10 rounded-md border px-3 font-black ${item === page ? 'border-sigfleet bg-sigfleet text-white' : 'border-zinc-300 bg-white text-zinc-800'}`}>{item}</button>
          </React.Fragment>
        )
      })}
      <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded-md border border-zinc-300 px-4 py-2 font-black disabled:opacity-40">Next</button>
    </nav>
  )
}

function SearchMap({ vehicles, selectedCar, onSelect, onBoundsChange }) {
  const center = useMemo(() => {
    const first = vehicles.find((car) => car.location_lat && car.location_lng)
    return first ? [first.location_lat, first.location_lng] : DEFAULT_CENTER
  }, [vehicles])
  const markerCars = useMemo(() => vehicles.filter((car) => car.location_lat && car.location_lng), [vehicles])

  return (
    <div className="relative h-[72vh] overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <MapContainer center={center} zoom={12} className="h-full w-full">
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapBoundsReporter onBoundsChange={onBoundsChange} />
        {markerCars.map((car) => (
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
          <VehicleCard car={selectedCar} />
        </div>
      )}
    </div>
  )
}

function MapBoundsReporter({ onBoundsChange }) {
  useMapEvents({
    moveend(event) {
      const map = event.target
      const center = map.getCenter()
      const bounds = map.getBounds()
      const radius = Math.max(3, Math.min(50, center.distanceTo(bounds.getNorthEast()) / 1000))
      onBoundsChange({ lat: center.lat.toFixed(6), lng: center.lng.toFixed(6), radius: radius.toFixed(1) })
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
        <h2 className="mt-5 text-2xl font-black text-zinc-950">No vehicles found. Try adjusting your filters.</h2>
        <button onClick={onClear} className="mt-5 rounded-md bg-sigfleet px-5 py-3 font-black text-white">Clear All Filters</button>
        <Link to="/" className="ml-3 mt-5 inline-flex rounded-md border border-zinc-300 px-5 py-3 font-black text-zinc-800">Start over</Link>
      </div>
    </div>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="grid min-h-[420px] place-items-center rounded-lg border border-red-200 bg-white p-8 text-center">
      <div>
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-red-50 text-sigfleet"><AlertTriangle size={36} /></div>
        <h2 className="mt-5 text-2xl font-black text-zinc-950">We could not load vehicles right now</h2>
        <p className="mt-2 max-w-md font-semibold text-zinc-600">{message || 'Please check your connection and try again.'}</p>
        <button onClick={onRetry} className="mt-5 rounded-md bg-sigfleet px-5 py-3 font-black text-white">Retry</button>
      </div>
    </div>
  )
}
