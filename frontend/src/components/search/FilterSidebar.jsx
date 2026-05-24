import React, { memo } from 'react'
import * as Slider from '@radix-ui/react-slider'
import { Check, SlidersHorizontal, X } from 'lucide-react'
import { FEATURE_OPTIONS, FUEL_TYPES, SEAT_OPTIONS, SORT_OPTIONS } from '../../utils/searchData'
import { useVehicleCategories } from '../../hooks/useVehicleCategories'

function toggleValue(values, value) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

function countBy(cars, key) {
  return cars.reduce((acc, car) => {
    const value = car[key]
    if (value !== undefined && value !== null) acc[value] = (acc[value] || 0) + 1
    return acc
  }, {})
}

function FilterSidebar({ filters, setFilters, cars = [], histogram = [], onClear, showSort = false, onApply, activeCount = 0 }) {
  const { categories, vehicleTypes } = useVehicleCategories()
  const categoryCounts = countBy(cars, 'category_id')
  const typeCounts = countBy(cars, 'vehicle_type_id')
  const fuelCounts = countBy(cars, 'fuel_type')

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
            max={10000}
            step={100}
            value={filters.price}
            onValueChange={(price) => patch({ price })}
          >
            <Slider.Track className="relative h-1.5 grow rounded-full bg-zinc-200">
              <Slider.Range className="absolute h-full rounded-full bg-sigfleet" />
            </Slider.Track>
            <Slider.Thumb className="block h-5 w-5 rounded-full border-2 border-sigfleet bg-white shadow" />
            <Slider.Thumb className="block h-5 w-5 rounded-full border-2 border-sigfleet bg-white shadow" />
          </Slider.Root>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <input className="input h-10" value={filters.price[0]} onChange={(event) => patch({ price: [Number(event.target.value), filters.price[1]] })} />
            <input className="input h-10" value={filters.price[1]} onChange={(event) => patch({ price: [filters.price[0], Number(event.target.value)] })} />
          </div>
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
                  <span className="text-xl">{item.icon_name ? '◼' : '•'}</span>
                  <span className="mt-1 block text-sm font-black text-zinc-900">{item.name}</span>
                  <span className="mt-1 inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-600">{categoryCounts[item.id] || item.vehicle_count || 0}</span>
                </button>
              )
            })}
          </div>
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

        <FilterSection title="Transmission">
          <div className="grid grid-cols-3 gap-2">
            {[['', 'Any'], ['manual', 'Manual'], ['automatic', 'Automatic']].map(([value, label]) => (
              <button key={label} type="button" onClick={() => patch({ transmission: value })} className={`rounded-md border px-3 py-3 text-sm font-black ${filters.transmission === value ? 'border-sigfleet bg-red-50 text-sigfleet' : 'border-zinc-200 text-zinc-700'}`}>{label}</button>
            ))}
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
  && prev.cars === next.cars
  && prev.histogram === next.histogram
  && prev.activeCount === next.activeCount
  && prev.showSort === next.showSort
))

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
