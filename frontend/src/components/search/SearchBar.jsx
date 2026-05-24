import React, { useEffect, useMemo, useState } from 'react'
import DatePicker from 'react-datepicker'
import { CalendarDays, Clock, MapPin, Search } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { addHours, CITIES, formatDuration, TOP_CITIES } from '../../utils/searchData'

function parseDate(value, fallback = null) {
  const parsed = value ? new Date(value) : null
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : fallback
}

export default function SearchBar({ className = '', compact = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useMemo(() => new URLSearchParams(location.search), [location.search])
  const [q, setQ] = useState(params.get('q') || '')
  const [city, setCity] = useState(params.get('city') || 'Bengaluru')
  const [cityDraft, setCityDraft] = useState(params.get('city') || 'Bengaluru')
  const [pickup, setPickup] = useState(parseDate(params.get('pickup_date') || params.get('start_date')))
  const [returnAt, setReturnAt] = useState(parseDate(params.get('return_date') || params.get('end_date')))

  useEffect(() => {
    const nextCity = params.get('city')
    const nextQ = params.get('q') || ''
    const nextStart = params.get('pickup_date') || params.get('start_date')
    const nextEnd = params.get('return_date') || params.get('end_date')
    setQ(nextQ)
    if (nextCity) {
      setCity(nextCity)
      setCityDraft(nextCity)
    }
    setPickup(parseDate(nextStart))
    setReturnAt(parseDate(nextEnd))
  }, [params])

  useEffect(() => {
    const timer = window.setTimeout(() => setCity(cityDraft), 300)
    return () => window.clearTimeout(timer)
  }, [cityDraft])

  function onPickupChange(date) {
    setPickup(date)
    if (!date) return
    const minimumReturn = addHours(date, 4)
    if (!returnAt || returnAt < minimumReturn) setReturnAt(minimumReturn)
  }

  function submit(event) {
    event.preventDefault()
    const keepExisting = location.pathname === '/vehicles' || location.pathname === '/search'
    const query = new URLSearchParams(keepExisting ? location.search : '')
    if (q.trim()) query.set('q', q.trim())
    else query.delete('q')
    query.set('city', city)
    if (pickup) query.set('pickup_date', pickup.toISOString())
    else query.delete('pickup_date')
    if (returnAt) query.set('return_date', returnAt.toISOString())
    else query.delete('return_date')
    query.delete('start_date')
    query.delete('end_date')
    query.set('page', '1')
    navigate(`/vehicles?${query.toString()}`)
  }

  return (
    <form onSubmit={submit} className={`rounded-lg border border-zinc-200 bg-white p-3 shadow-sm ${className}`}>
      <div className={`grid gap-3 ${compact ? 'lg:grid-cols-[1.2fr_.9fr_.9fr_.9fr_auto]' : 'lg:grid-cols-[1.3fr_.9fr_.9fr_.9fr_auto]'}`}>
        <div>
          <label className="label flex items-center gap-2"><Search size={16} /> Search</label>
          <input
            className="input mt-2 h-12"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search vehicles, brands, models..."
          />
        </div>
        <div>
          <label className="label flex items-center gap-2"><MapPin size={16} /> City</label>
          <input
            className="input mt-2 h-12"
            list="sigfleet-cities"
            value={cityDraft}
            onChange={(event) => setCityDraft(event.target.value)}
            placeholder="Select city"
          />
          <datalist id="sigfleet-cities">
            {CITIES.map((item) => <option key={item} value={item} />)}
          </datalist>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {TOP_CITIES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setCityDraft(item)
                  setCity(item)
                }}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${city === item ? 'border-sigfleet bg-red-50 text-sigfleet' : 'border-zinc-200 bg-zinc-50 text-zinc-600'}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label flex items-center gap-2"><CalendarDays size={16} /> Pickup</label>
          <DatePicker
            selected={pickup}
            onChange={onPickupChange}
            showTimeSelect
            isClearable
            timeIntervals={30}
            minDate={new Date()}
            dateFormat="dd MMM yyyy, h:mm aa"
            className="input mt-2 h-12"
          />
        </div>
        <div>
          <label className="label flex items-center gap-2"><Clock size={16} /> Return</label>
          <DatePicker
            selected={returnAt}
            onChange={setReturnAt}
            showTimeSelect
            isClearable
            timeIntervals={30}
            minDate={pickup ? addHours(pickup, 4) : new Date()}
            dateFormat="dd MMM yyyy, h:mm aa"
            className="input mt-2 h-12"
          />
          <div className="mt-2 inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs font-black text-zinc-700">
            {formatDuration(pickup, returnAt)}
          </div>
        </div>
        <button type="submit" className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-md bg-sigfleet px-5 font-black text-white transition hover:bg-red-700">
          <Search size={18} /> Search
        </button>
      </div>
    </form>
  )
}
