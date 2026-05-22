import React, { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2 } from 'lucide-react'
import api from '../../services/api'
import { HostBookingCard } from './BookingRequestsPage'

export default function ActiveTripsPage() {
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [ending, setEnding] = useState(null)
  const [odometerEnd, setOdometerEnd] = useState('')
  const [condition, setCondition] = useState('Perfect')
  const [notes, setNotes] = useState('')

  async function load() {
    setLoading(true)
    const response = await api.get('/bookings/', { params: { as_role: 'host', status: 'active' } })
    setTrips(response.data.bookings || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function endTrip() {
    await api.patch(`/bookings/${ending.id}/end-trip`, { odometer_end: Number(odometerEnd), condition_notes: `${condition}: ${notes}` })
    setEnding(null)
    load()
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8">
      <section className="mx-auto max-w-5xl">
        <p className="text-sm font-black uppercase text-zoomcar">Host</p>
        <h1 className="text-3xl font-black text-zinc-950">Active Trips</h1>
        {loading ? <div className="grid h-64 place-items-center"><Loader2 className="animate-spin text-zoomcar" /></div> : <div className="mt-5 grid gap-4">{trips.map((trip) => <HostBookingCard key={trip.id} booking={trip} onEnd={setEnding} />)}{!trips.length && <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-12 text-center font-black text-zinc-500">No active trips.</div>}</div>}
      </section>
      <Dialog.Root open={Boolean(ending)} onOpenChange={(open) => !open && setEnding(null)}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-5"><Dialog.Title className="text-xl font-black text-zinc-950">End trip</Dialog.Title><input className="input mt-4 h-11" type="number" value={odometerEnd} onChange={(event) => setOdometerEnd(event.target.value)} placeholder="Odometer end reading" /><div className="mt-3 grid grid-cols-3 gap-2">{['Perfect', 'Minor scratches', 'Damage'].map((item) => <button key={item} onClick={() => setCondition(item)} className={`rounded-md border px-3 py-2 text-sm font-black ${condition === item ? 'border-zoomcar bg-red-50 text-zoomcar' : 'border-zinc-200'}`}>{item}</button>)}</div><textarea className="input mt-3 min-h-24" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Condition notes" /><button onClick={endTrip} className="mt-4 rounded-md bg-zoomcar px-4 py-3 font-black text-white">Submit</button></Dialog.Content></Dialog.Portal>
      </Dialog.Root>
    </main>
  )
}
