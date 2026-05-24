import React, { useEffect, useState } from 'react'
import { Loader2, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import { useAuthStore } from '../../context/AuthContext'
import ReviewCard from '../../components/reviews/ReviewCard'
import DashboardShell from './DashboardShell'

export default function ReviewsPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState('given')
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!user) return
      setLoading(true)
      const response = tab === 'given' ? await api.get('/reviews/my/given') : await api.get(`/reviews/user/${user.id}`, { params: { type: 'received' } })
      setReviews(response.data.reviews || [])
      setLoading(false)
    }
    load()
  }, [tab, user])

  return (
    <DashboardShell title="Reviews" eyebrow="Reputation">
      <div className="mb-5 flex gap-2">
        <button onClick={() => setTab('given')} className={`rounded-md px-4 py-2 font-black ${tab === 'given' ? 'bg-sigfleet text-white' : 'bg-white text-zinc-600'}`}>Reviews I've Given</button>
        <button onClick={() => setTab('received')} className={`rounded-md px-4 py-2 font-black ${tab === 'received' ? 'bg-sigfleet text-white' : 'bg-white text-zinc-600'}`}>Reviews I've Received</button>
      </div>
      {loading ? <div className="grid h-80 place-items-center"><Loader2 className="animate-spin text-sigfleet" /></div> : reviews.length ? (
        <div className="grid gap-4 lg:grid-cols-2">{reviews.map((review) => <ReviewCard key={review._id || review.id} review={review} />)}</div>
      ) : (
        <div className="grid min-h-96 place-items-center rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center">
          <div><Star className="mx-auto text-zinc-400" size={44} /><h2 className="mt-3 text-2xl font-black">No reviews yet</h2><p className="mt-1 font-bold text-zinc-500">{tab === 'given' ? 'Completed trips will appear here when reviews are ready.' : 'Your trip reputation will show here.'}</p><Link to="/dashboard/bookings" className="mt-5 inline-flex rounded-md bg-sigfleet px-5 py-3 font-black text-white">View Bookings</Link></div>
        </div>
      )}
    </DashboardShell>
  )
}
