import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Car as Vehicle, Eye, IndianRupee, Loader2, Pencil, Power, Trash2 } from 'lucide-react'
import api from '../../services/api'

export default function ManagerVehiclesPage() {
  const [vehicles, setCars] = useState([])
  const [filter, setFilter] = useState('all')
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadCars() {
    setLoading(true)
    try {
      const response = await api.get('/vehicles/manager/vehicles')
      setCars(response.data.vehicles || [])
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to load vehicles.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCars()
  }, [])

  const filtered = useMemo(() => vehicles.filter((car) => {
    if (filter === 'active') return car.is_available && car.is_approved
    if (filter === 'pending') return !car.is_approved
    if (filter === 'inactive') return !car.is_available
    return true
  }), [vehicles, filter])

  const stats = {
    total: vehicles.length,
    active: vehicles.filter((car) => car.is_available && car.is_approved).length,
    pending: vehicles.filter((car) => !car.is_approved).length,
    earnings: vehicles.reduce((sum, car) => sum + Number(car.total_earnings || 0), 0),
  }

  async function toggle(carId) {
    const response = await api.patch(`/vehicles/manager/${carId}/toggle-availability`)
    setCars((current) => current.map((car) => car.id === carId ? { ...car, is_available: response.data.is_available } : car))
  }

  async function remove(carId) {
    await api.delete(`/vehicles/${carId}`)
    setCars((current) => current.map((car) => car.id === carId ? { ...car, is_available: false } : car))
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8">
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase text-sigfleet">Manager garage</p>
            <h1 className="text-3xl font-black text-zinc-950">My Vehicles</h1>
          </div>
          <Link to="/manager/vehicles/add" className="rounded-md bg-sigfleet px-5 py-3 font-bold text-white">Add Vehicle</Link>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Vehicle} label="Total Vehicles" value={stats.total} />
          <StatCard icon={Power} label="Active" value={stats.active} />
          <StatCard icon={Eye} label="Pending Review" value={stats.pending} />
          <StatCard icon={IndianRupee} label="Total Earnings" value={`₹${Math.round(stats.earnings).toLocaleString('en-IN')}`} />
        </div>
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-wrap gap-2 border-b border-zinc-200 p-4">
            {['all', 'active', 'pending', 'inactive'].map((tab) => (
              <button key={tab} onClick={() => setFilter(tab)} className={`rounded-md px-4 py-2 text-sm font-bold capitalize ${filter === tab ? 'bg-sigfleet text-white' : 'bg-zinc-100 text-zinc-600'}`}>{tab}</button>
            ))}
          </div>
          {error && <div className="m-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {isLoading ? (
            <div className="grid h-64 place-items-center"><Loader2 className="animate-spin text-sigfleet" /></div>
          ) : (
            <div className="divide-y divide-zinc-200">
              {filtered.map((car) => (
                <div key={car.id} className="grid gap-4 p-4 lg:grid-cols-[96px_1fr_auto] lg:items-center">
                  <img src={car.primary_image_url || 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=400&q=80'} alt="" className="h-24 w-24 rounded-md object-cover" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-black text-zinc-950">{car.title}</h2>
                      <span className={`rounded-full px-2 py-1 text-xs font-black ${car.is_approved ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{car.is_approved ? 'Active' : 'Pending'}</span>
                      {!car.is_available && <span className="rounded-full bg-zinc-200 px-2 py-1 text-xs font-black text-zinc-700">Inactive</span>}
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">{car.location_city} | ₹{Number(car.price_per_day).toLocaleString('en-IN')}/day | {car.average_rating} rating | {car.total_trips} trips | ₹{Number(car.total_earnings || 0).toLocaleString('en-IN')} earned</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => toggle(car.id)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-bold text-zinc-700">Toggle availability</button>
                    <Link to={`/manager/availability?vehicle=${car.id}`} className="rounded-md border border-teal-300 px-3 py-2 text-sm font-bold text-teal-700">Block Dates</Link>
                    <Link to={`/manager/vehicles/${car.id}/edit`} className="grid h-10 w-10 place-items-center rounded-md bg-zinc-100 text-zinc-700"><Pencil size={18} /></Link>
                    <Link to={`/manager/vehicles/${car.id}/bookings`} className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-bold text-white">Bookings</Link>
                    <button onClick={() => remove(car.id)} className="grid h-10 w-10 place-items-center rounded-md bg-red-50 text-red-700"><Trash2 size={18} /></button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="p-10 text-center font-semibold text-zinc-500">No vehicles in this view.</div>}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <Icon className="text-sigfleet" size={24} />
      <p className="mt-4 text-sm font-bold text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-zinc-950">{value}</p>
    </div>
  )
}
