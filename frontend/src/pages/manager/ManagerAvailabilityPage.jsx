import React, { useEffect, useMemo, useState } from 'react'
import api from '../../services/api'

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function ManagerAvailabilityPage() {
  const [cars, setCars] = useState([])
  const [selected, setSelected] = useState('all')
  const today = new Date()
  const days = useMemo(() => Array.from({ length: new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() }, (_, index) => new Date(today.getFullYear(), today.getMonth(), index + 1)), [today.getFullYear(), today.getMonth()])

  useEffect(() => {
    api.get('/vehicles/manager/vehicles').then((response) => setCars(response.data.cars || []))
  }, [])

  const visibleCars = selected === 'all' ? cars : cars.filter((car) => car.id === selected)

  return (
    <div className="px-4 py-8">
      <section className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-black uppercase text-sigfleet">Availability Overview</p><h1 className="text-3xl font-black">Fleet calendar</h1></div>
          <select className="rounded-md border border-zinc-200 bg-white px-3 py-2 font-bold" value={selected} onChange={(event) => setSelected(event.target.value)}>
            <option value="all">All vehicles</option>
            {cars.map((car) => <option key={car.id} value={car.id}>{car.title}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="grid min-w-[980px]" style={{ gridTemplateColumns: `220px repeat(${days.length}, minmax(34px, 1fr))` }}>
            <div className="sticky left-0 z-10 bg-white p-3 text-xs font-black uppercase text-zinc-500">Vehicle</div>
            {days.map((day) => <div key={day.toISOString()} className="border-l border-zinc-100 p-2 text-center text-[11px] font-black text-zinc-500">{day.getDate()}<br />{dayNames[day.getDay()]}</div>)}
            {visibleCars.map((car) => <React.Fragment key={car.id}>
              <div className="sticky left-0 z-10 border-t border-zinc-100 bg-white p-3 font-black">{car.title}</div>
              {days.map((day) => <button key={`${car.id}-${day.toISOString()}`} className={`border-l border-t border-zinc-100 p-2 text-xs font-black ${car.is_available && car.is_approved ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`} title={car.is_available && car.is_approved ? 'Available' : 'Unavailable'}>{car.is_available && car.is_approved ? 'A' : 'B'}</button>)}
            </React.Fragment>)}
          </div>
        </div>
      </section>
    </div>
  )
}
