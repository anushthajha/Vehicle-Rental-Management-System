import React, { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, Star } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useAuthStore } from '../../context/AuthContext'

const REVIEW_LABELS = {
  guest_to_car: 'Rate the Car',
  guest_to_manager: 'Rate the Manager',
  manager_to_guest: 'Rate the Guest',
}

export default function WriteReviewPage() {
  const { bookingId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [booking, setBooking] = useState(null)
  const [existing, setExisting] = useState([])
  const [activeType, setActiveType] = useState('')
  const [form, setForm] = useState({ rating: 0, title: '', body: '' })
  const [hover, setHover] = useState(0)
  const [loading, setLoading] = useState(true)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    async function load() {
      const [bookingResponse, reviewsResponse] = await Promise.all([
        api.get(`/bookings/${bookingId}`),
        api.get(`/reviews/booking/${bookingId}`).catch(() => ({ data: { reviews: [] } })),
      ])
      setBooking(bookingResponse.data)
      setExisting(reviewsResponse.data.reviews || [])
      setLoading(false)
    }
    load()
  }, [bookingId])

  const pendingTypes = useMemo(() => {
    if (!booking || !user) return []
    const allowed = user.id === booking.guest_id ? ['guest_to_car', 'guest_to_manager'] : user.id === booking.manager_id ? ['manager_to_guest'] : []
    return allowed.filter((type) => !existing.some((review) => review.review_type === type))
  }, [booking, existing, user])

  useEffect(() => {
    if (!activeType && pendingTypes.length) setActiveType(pendingTypes[0])
  }, [pendingTypes, activeType])

  async function submit(event) {
    event.preventDefault()
    if (!form.rating) {
      toast.error('Choose a star rating')
      return
    }
    try {
      await api.post('/reviews', { booking_id: bookingId, review_type: activeType, ...form })
      setSuccess(true)
      window.setTimeout(() => navigate(`/dashboard/bookings/${bookingId}`), 1600)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not submit review')
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-zinc-50"><Loader2 className="animate-spin text-sigfleet" /></main>
  if (success) return <SuccessState bookingId={bookingId} />
  if (!pendingTypes.length) return <main className="grid min-h-screen place-items-center bg-zinc-50 px-4 text-center"><div><CheckCircle2 className="mx-auto text-emerald-600" size={54} /><h1 className="mt-4 text-2xl font-black">All reviews are complete</h1><Link to={`/dashboard/bookings/${bookingId}`} className="mt-5 inline-flex rounded-md bg-sigfleet px-5 py-3 font-black text-white">Back to booking</Link></div></main>

  const target = activeType === 'manager_to_guest' ? booking.counterparty : activeType === 'guest_to_manager' ? booking.counterparty : booking.car

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8">
      <section className="mx-auto max-w-3xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-black uppercase text-sigfleet">Review trip {booking.booking_ref}</p>
        <h1 className="mt-2 text-3xl font-black">Share your experience</h1>
        {pendingTypes.length > 1 && <div className="mt-6 flex gap-2">{pendingTypes.map((type) => <button key={type} onClick={() => setActiveType(type)} className={`rounded-md px-4 py-2 font-black ${activeType === type ? 'bg-sigfleet text-white' : 'bg-zinc-100 text-zinc-700'}`}>{REVIEW_LABELS[type]}</button>)}</div>}

        <div className="mt-6 flex items-center gap-4 rounded-lg bg-zinc-50 p-4">
          <img src={target?.primary_image_url || target?.photo || 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=300&q=80'} alt="" className="h-20 w-20 rounded-md object-cover" />
          <div><p className="text-sm font-black text-zinc-500">{REVIEW_LABELS[activeType]}</p><h2 className="text-xl font-black">{target?.title || target?.name || 'Trip partner'}</h2></div>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-5">
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button key={star} type="button" onMouseEnter={() => setHover(star)} onMouseLeave={() => setHover(0)} onClick={() => setForm((current) => ({ ...current, rating: star }))} className="transition active:scale-110" aria-label={`${star} stars`}>
                <Star size={38} className={star <= (hover || form.rating) ? 'fill-amber-400 text-amber-400' : 'text-zinc-300'} />
              </button>
            ))}
          </div>
          <input className="input h-11" maxLength={100} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Summarize your experience" />
          <div>
            <textarea className="input min-h-40" minLength={30} maxLength={2000} value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} placeholder="Tell others about your trip..." required />
            <p className="mt-1 text-right text-xs font-bold text-zinc-500">{form.body.length}/2000</p>
          </div>
          <button className="rounded-md bg-sigfleet px-6 py-3 font-black text-white">Submit Review</button>
        </form>
      </section>
    </main>
  )
}

function SuccessState({ bookingId }) {
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-50 px-4 text-center">
      <div className="relative rounded-lg border border-zinc-200 bg-white p-10 shadow-sm">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-amber-50 text-amber-500"><Star className="fill-amber-400" size={42} /></div>
        <div className="pointer-events-none absolute inset-x-0 top-8 mx-auto h-32 w-32 animate-ping rounded-full bg-amber-200/30" />
        <h1 className="mt-5 text-3xl font-black">Review submitted!</h1>
        <p className="mt-2 font-bold text-zinc-500">Thank you.</p>
        <Link to={`/dashboard/bookings/${bookingId}`} className="mt-5 inline-flex rounded-md bg-sigfleet px-5 py-3 font-black text-white">Back to booking</Link>
      </div>
    </main>
  )
}
