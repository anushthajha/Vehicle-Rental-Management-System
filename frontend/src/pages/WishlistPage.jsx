import React, { useEffect, useState } from 'react'
import { Heart, Loader2 } from 'lucide-react'
import api from '../services/api'
import VehicleCard from '../components/vehicle/VehicleCard'
import { useAuthStore } from '../context/AuthContext'
import { getLocalWishlistCars, removeLocalWishlistCar } from '../utils/wishlist'

export default function WishlistPage() {
  const { user } = useAuthStore()
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState({})

  useEffect(() => {
    async function loadWishlist() {
      setLoading(true)
      if (user) {
        const response = await api.get('/wishlist/')
        setCars(response.data.cars || [])
      } else {
        setCars(getLocalWishlistCars())
      }
      setLoading(false)
    }
    loadWishlist()
  }, [user])

  function onRemoved(carId) {
    setRemoving((current) => ({ ...current, [carId]: true }))
    window.setTimeout(() => {
      if (!user) removeLocalWishlistCar(carId)
      setCars((current) => current.filter((car) => car.id !== carId))
      setRemoving((current) => ({ ...current, [carId]: false }))
    }, 220)
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8">
      <section className="mx-auto max-w-7xl">
        <div className="mb-6">
          <p className="text-sm font-black uppercase text-sigfleet">Saved cars</p>
          <h1 className="text-3xl font-black text-zinc-950">Wishlist</h1>
        </div>

        {loading ? (
          <div className="grid h-64 place-items-center"><Loader2 className="animate-spin text-sigfleet" /></div>
        ) : cars.length === 0 ? (
          <div className="grid min-h-[420px] place-items-center rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center">
            <div>
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-red-50 text-sigfleet"><Heart size={34} /></div>
              <h2 className="mt-5 text-2xl font-black text-zinc-950">No saved cars yet. Start exploring!</h2>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cars.map((car) => (
              <div key={car.id} className={`transition duration-200 ${removing[car.id] ? 'scale-95 opacity-0' : 'opacity-100'}`}>
                <VehicleCard car={{ ...car, is_saved: true }} onRemoved={onRemoved} />
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
