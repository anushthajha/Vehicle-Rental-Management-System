import React, { useState } from 'react'
import { Star } from 'lucide-react'

export default function ReviewCard({ review }) {
  const [expanded, setExpanded] = useState(false)
  const body = review.body || ''
  const shouldCollapse = body.length > 200
  const visibleBody = shouldCollapse && !expanded ? `${body.slice(0, 200)}...` : body
  const name = review.reviewer_name || 'Zoomcar user'

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        {review.reviewer_photo ? (
          <img src={review.reviewer_photo} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <div className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100 font-black text-zinc-600">{initials(name)}</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-black text-zinc-950">{name}</h3>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">Verified Trip</span>
          </div>
          <p className="mt-1 text-sm font-bold text-zinc-500">{monthLabel(review.created_at)}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-1" aria-label={`${review.rating} stars`}>
        {[1, 2, 3, 4, 5].map((star) => <Star key={star} size={18} className={star <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-300'} />)}
      </div>
      {review.title && <h4 className="mt-3 text-lg font-black text-zinc-950">{review.title}</h4>}
      <p className="mt-2 whitespace-pre-wrap font-medium leading-7 text-zinc-700">{visibleBody}</p>
      {shouldCollapse && <button onClick={() => setExpanded((value) => !value)} className="mt-2 text-sm font-black text-zoomcar">{expanded ? 'Show less' : 'Read more'}</button>}

      {review.host_reply && (
        <div className="mt-5 border-l-4 border-zoomcar bg-red-50 p-4">
          <p className="font-black text-zinc-950">Response from {review.host_name || 'Host'}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm font-medium text-zinc-700">{review.host_reply}</p>
          <p className="mt-2 text-xs font-bold text-zinc-500">{monthLabel(review.host_replied_at)}</p>
        </div>
      )}
    </article>
  )
}

function initials(name) {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

function monthLabel(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
