import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../services/api'
import VehicleCard from '../components/vehicle/VehicleCard'
import { PageHero, PublicShell, Section } from './static/StaticShell'

const cityImages = {
  bengaluru: 'https://images.unsplash.com/photo-1596176530529-78163a4f7af2?w=1400',
  mumbai: 'https://images.unsplash.com/photo-1595658658481-d53d3f999875?w=1400',
  delhi: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=1400',
  pune: 'https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=1400',
  chennai: 'https://images.unsplash.com/photo-1582510003544-4d00b7f74220?w=1400',
  hyderabad: 'https://images.unsplash.com/photo-1545431781-3e1b506e9a37?w=1400',
  jaipur: 'https://images.unsplash.com/photo-1477587458883-47145ed68d72?w=1400',
  goa: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=1400',
}
const areas = {
  bengaluru: ['Koramangala', 'Indiranagar', 'Whitefield', 'HSR Layout'],
  mumbai: ['Bandra', 'Andheri', 'Powai', 'Lower Parel'],
  delhi: ['Saket', 'Connaught Place', 'Dwarka', 'Rohini'],
  goa: ['Panaji', 'Calangute', 'Vagator', 'Margao'],
}

export default function CityPage() {
  const { city } = useParams()
  const name = useMemo(() => city.charAt(0).toUpperCase() + city.slice(1), [city])
  const [vehicles, setCars] = useState([])
  useEffect(() => { api.get('/vehicles', { params: { city: name, limit: 12 } }).then((r) => setCars(r.data.vehicles || r.data.items || [])).catch(() => setCars([])) }, [name])
  const chips = areas[city] || ['Central', 'Airport Road', 'Business District', 'Railway Station']
  return <PublicShell><PageHero eyebrow={name} title={`Self-drive vehicles in ${name}`} subtitle={`Book verified vehicles across popular ${name} neighborhoods for city drives, business trips, and weekend escapes.`} image={cityImages[city]} /><Section title={`Popular areas in ${name}`}><div className="flex flex-wrap gap-2">{chips.map((area) => <Link key={area} to={`/vehicles?city=${name}&area=${area}`} className="rounded-full bg-white px-4 py-2 font-black shadow-sm">{area}</Link>)}</div></Section><Section title={`Vehicles available in ${name}`}><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{vehicles.map((car) => <VehicleCard key={car.id} car={car} />)}{!vehicles.length && <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center font-black text-zinc-500">No vehicles found yet.</div>}</div></Section><Section title="Travel tips"><div className="grid gap-4 md:grid-cols-3">{['Book morning pickups to avoid traffic peaks.', 'Keep toll and parking receipts until trip closure.', 'Choose SUV or MUV categories for longer group routes.'].map((tip) => <div key={tip} className="rounded-lg bg-white p-5 font-bold shadow-sm">{tip}</div>)}</div></Section><Section title={`Popular routes from ${name}`}><div className="grid gap-3 md:grid-cols-4">{['Weekend hills', 'Airport run', 'Beach escape', 'Heritage trail'].map((route) => <div key={route} className="rounded-lg border border-zinc-200 bg-white p-4 font-black">{name} → {route}</div>)}</div></Section></PublicShell>
}
