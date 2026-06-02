import React, { memo, useEffect, useMemo, useState } from 'react'
import * as Slider from '@radix-ui/react-slider'
import { useQuery } from '@tanstack/react-query'
import { Check, SlidersHorizontal, X } from 'lucide-react'
import api from '../../services/api'
import { FEATURE_OPTIONS, FUEL_TYPES, SEAT_OPTIONS, SORT_OPTIONS } from '../../utils/searchData'
import { useVehicleCategories } from '../../hooks/useVehicleCategories'

function toggleValue(values, value) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

function countBy(vehicles, key) {
  return vehicles.reduce((acc, car) => {
    const value = car[key]
    if (value !== undefined && value !== null) acc[value] = (acc[value] || 0) + 1
    return acc
  }, {})
}

function FilterSidebar({ filters, setFilters, vehicles = [], histogram = [], onClear, showSort = false, onApply, activeCount = 0, total = 0, brandsAvailable = [], brandCounts = {}, priceRange = { min: 0, max: 10000 } }) {
  const { categories, vehicleTypes } = useVehicleCategories()
  const [qDraft, setQDraft] = useState(filters.q || '')
  const [brandSearch, setBrandSearch] = useState('')
  const [showAllBrands, setShowAllBrands] = useState(false)
  const brandsQuery = useQuery({
    queryKey: ['vehicle-brands'],
    queryFn: async () => {
      const response = await api.get('/vehicles/brands')
      return response.data.brands || []
    },
    staleTime: 5 * 60 * 1000,
  })
  const categoryCounts = countBy(vehicles, 'category_id')
  const typeCounts = countBy(vehicles, 'vehicle_type_id')
  const fuelCounts = countBy(vehicles, 'fuel_type')
  const allBrands = useMemo(() => {
    const merged = new Set([...(brandsQuery.data || []), ...brandsAvailable, ...(filters.brands || [])])
    return Array.from(merged).sort((a, b) => a.localeCompare(b))
  }, [brandsAvailable, brandsQuery.data, filters.brands])
  const visibleBrands = useMemo(() => {
    const filtered = allBrands.filter((brand) => brand.toLowerCase().includes(brandSearch.trim().toLowerCase()))
    return showAllBrands ? filtered : filtered.slice(0, 10)
  }, [allBrands, brandSearch, showAllBrands])

  useEffect(() => {
    setQDraft(filters.q || '')
  }, [filters.q])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (qDraft !== (filters.q || '')) patch({ q: qDraft })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [qDraft])

  function patch(changes) {
    setFilters((current) => ({ ...current, ...changes }))
  }

  return (
    <aside className="h-full overflow-y-auto bg-white">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={18} className="text-sigfleet" />
          <h2 className="font-black text-zinc-950">Filters</h2>
          {activeCount > 0 && <span className="rounded-full bg-sigfleet px-2 py-0.5 text-xs font-black text-white">{activeCount}</span>}
        </div>
        <button type="button" onClick={onClear} className="text-sm font-black text-sigfleet">Clear All</button>
      </div>

      <div className="space-y-6 p-4">
        {showSort && (
          <FilterSection title="Sort">
            <select className="input h-11" value={filters.sortBy} onChange={(event) => patch({ sortBy: event.target.value })}>
              {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </FilterSection>
        )}

        <FilterSection title="Search">
          <input
            className="input h-11"
            value={qDraft}
            onChange={(event) => setQDraft(event.target.value)}
            placeholder="Search by name, brand, or model..."
          />
          <p className="mt-2 text-xs font-bold text-zinc-500">{total} results</p>
        </FilterSection>

        <FilterSection title="Availability">
          <button
            type="button"
            onClick={() => patch({ availability: !filters.availability })}
            className={`flex w-full items-center justify-between rounded-md border px-3 py-3 text-left ${filters.availability ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-zinc-200 text-zinc-700'}`}
          >
            <span className="text-sm font-black">Show Available Only</span>
            <span className={`h-6 w-11 rounded-full p-1 transition ${filters.availability ? 'bg-emerald-500' : 'bg-zinc-300'}`}>
              <span className={`block h-4 w-4 rounded-full bg-white transition ${filters.availability ? 'translate-x-5' : ''}`} />
            </span>
          </button>
        </FilterSection>

        <FilterSection title="Vehicle Type">
          <CheckboxList
            values={vehicleTypes.map((item) => item.id)}
            selected={filters.vehicleTypes || []}
            labels={(value) => vehicleTypes.find((item) => item.id === value)?.name || value}
            counts={typeCounts}
            onToggle={(value) => patch({ vehicleTypes: toggleValue(filters.vehicleTypes || [], value) })}
          />
        </FilterSection>

        <FilterSection title="Brand">
          <input className="input mb-3 h-10" value={brandSearch} onChange={(event) => setBrandSearch(event.target.value)} placeholder="Filter brands" />
          <CheckboxList
            values={visibleBrands}
            selected={filters.brands || []}
            labels={(value) => value}
            counts={brandCounts}
            onToggle={(value) => patch({ brands: toggleValue(filters.brands || [], value) })}
          />
          {allBrands.length > 10 && (
            <button type="button" onClick={() => setShowAllBrands((value) => !value)} className="mt-2 text-sm font-black text-sigfleet">
              {showAllBrands ? 'Show less' : `Show more (+${allBrands.length - 10})`}
            </button>
          )}
        </FilterSection>

        <FilterSection title="Category">
          <div className="grid grid-cols-2 gap-2">
            {categories.map((item) => {
              const active = filters.categories.includes(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => patch({ categories: toggleValue(filters.categories, item.id) })}
                  className={`rounded-md border p-3 text-left transition ${active ? 'border-sigfleet bg-red-50' : 'border-zinc-200 bg-white hover:border-zinc-300'}`}
                >
                  <span className="text-xl">{iconLabel(item.icon_name)}</span>
                  <span className="mt-1 block text-sm font-black text-zinc-900">{item.name}</span>
                  <span className="mt-1 inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-600">{categoryCounts[item.id] || item.vehicle_count || 0}</span>
                </button>
              )
            })}
          </div>
        </FilterSection>

        <FilterSection title="Price Range (₹/day)">
          <div className="mb-3 flex h-12 items-end gap-1">
            {histogram.map((bar, index) => (
              <span
                key={index}
                className="flex-1 rounded-t bg-red-100"
                style={{ height: `${Math.max(10, bar)}%` }}
              />
            ))}
          </div>
          <Slider.Root
            className="relative flex h-5 w-full touch-none select-none items-center"
            min={0}
            max={Math.max(Math.ceil(priceRange.max || 10000), filters.price[1], 100)}
            step={100}
            value={filters.price}
            onValueChange={(price) => patch({ price, priceTouched: true })}
          >
            <Slider.Track className="relative h-1.5 grow rounded-full bg-zinc-200">
              <Slider.Range className="absolute h-full rounded-full bg-sigfleet" />
            </Slider.Track>
            <Slider.Thumb className="block h-5 w-5 rounded-full border-2 border-sigfleet bg-white shadow" />
            <Slider.Thumb className="block h-5 w-5 rounded-full border-2 border-sigfleet bg-white shadow" />
          </Slider.Root>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <input className="input h-10" value={filters.price[0]} onChange={(event) => patch({ price: [Number(event.target.value), filters.price[1]], priceTouched: true })} />
            <input className="input h-10" value={filters.price[1]} onChange={(event) => patch({ price: [filters.price[0], Number(event.target.value)], priceTouched: true })} />
          </div>
        </FilterSection>

        <FilterSection title="Fuel Type">
          <CheckboxList
            values={FUEL_TYPES}
            selected={filters.fuelTypes}
            labels={(value) => value.toUpperCase()}
            counts={fuelCounts}
            onToggle={(value) => patch({ fuelTypes: toggleValue(filters.fuelTypes, value) })}
          />
        </FilterSection>

        <FilterSection title="Transmission">
          <div className="grid grid-cols-3 gap-2">
            {[['', 'Any'], ['manual', 'Manual'], ['automatic', 'Automatic']].map(([value, label]) => (
              <button key={label} type="button" onClick={() => patch({ transmission: value })} className={`rounded-md border px-3 py-3 text-sm font-black ${filters.transmission === value ? 'border-sigfleet bg-red-50 text-sigfleet' : 'border-zinc-200 text-zinc-700'}`}>{label}</button>
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Seats">
          <div className="grid grid-cols-3 gap-2">
            {SEAT_OPTIONS.map((seat) => (
              <button key={seat} type="button" onClick={() => patch({ seats: toggleValue(filters.seats, seat) })} className={`rounded-md border px-3 py-2 text-sm font-black ${filters.seats.includes(seat) ? 'border-sigfleet bg-red-50 text-sigfleet' : 'border-zinc-200 text-zinc-700'}`}>{seat === 8 ? '8+' : seat}</button>
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Features">
          <div className="grid grid-cols-2 gap-2">
            {FEATURE_OPTIONS.map((item) => (
              <button key={item.key} type="button" onClick={() => patch({ features: toggleValue(filters.features, item.key) })} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-bold ${filters.features.includes(item.key) ? 'border-sigfleet bg-red-50 text-sigfleet' : 'border-zinc-200 text-zinc-700'}`}>
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Rating">
          <div className="grid grid-cols-3 gap-2">
            {[['', 'Any'], ['3', '3+ Stars'], ['4', '4+ Stars']].map(([value, label]) => (
              <button key={label} type="button" onClick={() => patch({ rating: value })} className={`rounded-md border px-3 py-3 text-sm font-black ${filters.rating === value ? 'border-sigfleet bg-red-50 text-sigfleet' : 'border-zinc-200 text-zinc-700'}`}>{label}</button>
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Location">
          <Slider.Root
            className="relative flex h-5 w-full touch-none select-none items-center"
            min={5}
            max={50}
            step={5}
            value={[filters.distance || 25]}
            onValueChange={([distance]) => patch({ distance })}
          >
            <Slider.Track className="relative h-1.5 grow rounded-full bg-zinc-200">
              <Slider.Range className="absolute h-full rounded-full bg-sigfleet" />
            </Slider.Track>
            <Slider.Thumb className="block h-5 w-5 rounded-full border-2 border-sigfleet bg-white shadow" />
          </Slider.Root>
          <p className="mt-2 text-xs font-bold text-zinc-500">{filters.distance || 25} km radius when location is active</p>
        </FilterSection>
      </div>

      {onApply && (
        <div className="sticky bottom-0 grid grid-cols-[1fr_auto] gap-3 border-t border-zinc-200 bg-white p-4">
          <button type="button" onClick={onClear} className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-300 px-4 py-3 font-black text-zinc-800"><X size={16} /> Clear All</button>
          <button type="button" onClick={onApply} className="inline-flex items-center justify-center gap-2 rounded-md bg-sigfleet px-5 py-3 font-black text-white"><Check size={16} /> Apply Filters</button>
        </div>
      )}
    </aside>
  )
}

export default memo(FilterSidebar, (prev, next) => (
  prev.filters === next.filters
  && prev.vehicles === next.vehicles
  && prev.histogram === next.histogram
  && prev.activeCount === next.activeCount
  && prev.showSort === next.showSort
))

function iconLabel(iconName) {
  const icons = {
    car: '🚗',
    bike: '🏍',
    scooter: '🛵',
    truck: '▣',
    van: '▤',
    sedan: '🚘',
    suv: '🚙',
    hatchback: '🚗',
    electric: '⚡',
  }
  return icons[String(iconName || '').toLowerCase()] || '•'
}

function FilterSection({ title, children }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-zinc-500">{title}</h3>
      {children}
    </section>
  )
}

function CheckboxList({ values, selected, labels, counts = {}, onToggle }) {
  return (
    <div className="space-y-2">
      {values.map((value) => (
        <button key={value} type="button" onClick={() => onToggle(value)} className="flex w-full items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-left">
          <span className="flex items-center gap-2 text-sm font-bold text-zinc-800">
            <span className={`grid h-5 w-5 place-items-center rounded border ${selected.includes(value) ? 'border-sigfleet bg-sigfleet text-white' : 'border-zinc-300'}`}>
              {selected.includes(value) && <Check size={13} />}
            </span>
            {labels(value)}
          </span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-black text-zinc-500">{counts[value] || 0}</span>
        </button>
      ))}
    </div>
  )
}
