import React, { useEffect, useMemo, useState } from 'react'
import DatePicker from 'react-datepicker'
import { CalendarDays, Clock, MapPin, Search } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { addHours, CITIES, formatDuration, TOP_CITIES } from '../../utils/searchData'

function parseDate(value, fallback) {
  const parsed = value ? new Date(value) : null
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : fallback
}

export default function SearchBar({ className = '', compact = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useMemo(() => new URLSearchParams(location.search), [location.search])
  const now = useMemo(() => new Date(), [])
  const defaultPickup = addHours(now, 24)
  const [city, setCity] = useState(params.get('city') || 'Bengaluru')
  const [cityDraft, setCityDraft] = useState(params.get('city') || 'Bengaluru')
  const [pickup, setPickup] = useState(parseDate(params.get('start_date'), defaultPickup))
  const [returnAt, setReturnAt] = useState(parseDate(params.get('end_date'), addHours(defaultPickup, 28)))

  useEffect(() => {
    const nextCity = params.get('city')
    const nextStart = params.get('start_date')
    const nextEnd = params.get('end_date')
    if (nextCity) {
      setCity(nextCity)
      setCityDraft(nextCity)
    }
    if (nextStart) setPickup(parseDate(nextStart, defaultPickup))
    if (nextEnd) setReturnAt(parseDate(nextEnd, addHours(defaultPickup, 28)))
  }, [defaultPickup, params])

  useEffect(() => {
    const timer = window.setTimeout(() => setCity(cityDraft), 300)
    return () => window.clearTimeout(timer)
  }, [cityDraft])

  function onPickupChange(date) {
    setPickup(date)
    const minimumReturn = addHours(date, 4)
    if (!returnAt || returnAt < minimumReturn) setReturnAt(minimumReturn)
  }

  function submit(event) {
    event.preventDefault()
    const query = new URLSearchParams(location.pathname === '/search' ? location.search : '')
    query.set('city', city)
    query.set('start_date', pickup.toISOString())
    query.set('end_date', returnAt.toISOString())
    navigate(`/search?${query.toString()}`)
  }

  return (
    <form onSubmit={submit} className={`rounded-lg border border-zinc-200 bg-white p-3 shadow-sm ${className}`}>
      <div className={`grid gap-3 ${compact ? 'lg:grid-cols-[1.1fr_1fr_1fr_auto]' : 'lg:grid-cols-[1.2fr_1fr_1fr_auto]'}`}>
        <div>
          <label className="label flex items-center gap-2"><MapPin size={16} /> City</label>
          <input
            className="input mt-2 h-12"
            list="zoomcar-cities"
            value={cityDraft}
            onChange={(event) => setCityDraft(event.target.value)}
            placeholder="Select city"
          />
          <datalist id="zoomcar-cities">
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
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${city === item ? 'border-zoomcar bg-red-50 text-zoomcar' : 'border-zinc-200 bg-zinc-50 text-zinc-600'}`}
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
            timeIntervals={30}
            minDate={addHours(pickup, 4)}
            dateFormat="dd MMM yyyy, h:mm aa"
            className="input mt-2 h-12"
          />
          <div className="mt-2 inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs font-black text-zinc-700">
            {formatDuration(pickup, returnAt)}
          </div>
        </div>
        <button type="submit" className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-md bg-zoomcar px-5 font-black text-white transition hover:bg-red-700">
          <Search size={18} /> Search Cars
        </button>
      </div>
    </form>
  )
}
