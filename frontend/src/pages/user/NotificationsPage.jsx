import React, { useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck, CreditCard, FileCheck2, Info, Loader2, MessageSquare, Settings, Tag, Trash2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../../services/api'
import DashboardShell from './DashboardShell'

const FILTERS = ['all', 'unread', 'booking', 'payment', 'kyc', 'system']

const TYPE_ICONS = {
  booking: [Bell, 'bg-blue-50 text-blue-700'],
  payment: [CreditCard, 'bg-emerald-50 text-emerald-700'],
  kyc: [FileCheck2, 'bg-amber-50 text-amber-700'],
  system: [Settings, 'bg-zinc-100 text-zinc-700'],
  promotion: [Tag, 'bg-red-50 text-sigfleet'],
  review: [MessageSquare, 'bg-violet-50 text-violet-700'],
  manager: [Info, 'bg-cyan-50 text-cyan-700'],
}

function formatNotificationTime(timestamp) {
  if (!timestamp) return ''
  let date
  if (typeof timestamp === 'string') {
    const hasTimezone = timestamp.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(timestamp)
    date = new Date(hasTimezone ? timestamp : `${timestamp}Z`)
  } else {
    date = new Date(timestamp)
  }
  if (Number.isNaN(date.getTime())) return 'just now'

  const diffSecs = Math.max(Math.floor((Date.now() - date.getTime()) / 1000), 0)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 30) return 'just now'
  if (diffSecs < 60) return `${diffSecs} seconds ago`
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const sentinelRef = useRef(null)
  const [filter, setFilter] = useState('all')
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    setItems([])
    setPage(1)
    load(1, true)
  }, [filter])

  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return undefined
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNext && !loadingMore) {
        const nextPage = page + 1
        setPage(nextPage)
        load(nextPage, false)
      }
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasNext, loadingMore, page, filter])

  async function load(nextPage = 1, replace = false) {
    replace ? setLoading(true) : setLoadingMore(true)
    const response = await api.get('/notifications', { params: { type: filter, page: nextPage, limit: 20 } })
    setItems((current) => (replace ? response.data.notifications || [] : [...current, ...(response.data.notifications || [])]))
    setHasNext(response.data.has_next)
    setLoading(false)
    setLoadingMore(false)
  }

  async function openNotification(item) {
    if (!item.is_read) {
      await api.patch(`/notifications/${item._id}/read`)
      setItems((current) => current.map((entry) => (entry._id === item._id ? { ...entry, is_read: true } : entry)))
    }
    if (item.action_url) navigate(item.action_url)
  }

  async function markAll() {
    await api.patch('/notifications/mark-all-read')
    setItems((current) => current.map((item) => ({ ...item, is_read: true })))
  }

  async function deleteOne(id) {
    try {
      await api.delete(`/notifications/${id}`)
      setItems((current) => current.filter((item) => item._id !== id))
    } catch {
      toast.error('Could not delete notification')
    }
  }

  async function clearAll() {
    if (!window.confirm('Delete all notifications? This cannot be undone.')) return
    try {
      await api.delete('/notifications/all')
      setItems([])
      toast.success('All notifications cleared')
    } catch {
      toast.error('Could not clear all notifications')
    }
  }

  const hasUnread = items.some((item) => !item.is_read)

  const actions = (
    <div className="flex items-center gap-2">
      <button
        onClick={markAll}
        disabled={!hasUnread}
        className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-black ${hasUnread ? 'border-zinc-300 bg-white text-zinc-800' : 'border-zinc-200 bg-zinc-50 text-zinc-300 cursor-not-allowed'}`}
      >
        <CheckCheck size={16} /> Mark all read
      </button>
      {items.length > 0 && (
        <button onClick={clearAll} className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-black text-red-700 hover:bg-red-100 transition">
          <Trash2 size={16} /> Clear all
        </button>
      )}
    </div>
  )

  return (
    <DashboardShell title="Notifications" eyebrow="Inbox" actions={actions}>
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button key={item} onClick={() => setFilter(item)} className={`rounded-md px-4 py-2 font-black capitalize ${filter === item ? 'bg-sigfleet text-white' : 'bg-white text-zinc-600'}`}>
            {item}
          </button>
        ))}
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        {loading ? (
          <div className="grid h-80 place-items-center"><Loader2 className="animate-spin text-sigfleet" /></div>
        ) : items.length ? (
          <div className="divide-y divide-zinc-100">
            {items.map((item) => (
              <NotificationItem
                key={item._id}
                item={item}
                onClick={() => openNotification(item)}
                onDelete={(e) => { e.stopPropagation(); deleteOne(item._id) }}
              />
            ))}
            <div ref={sentinelRef} className="grid h-16 place-items-center">
              {loadingMore && <Loader2 className="animate-spin text-sigfleet" />}
            </div>
          </div>
        ) : (
          <div className="grid min-h-96 place-items-center text-center">
            <div>
              <Bell className="mx-auto text-zinc-400" size={42} />
              <h2 className="mt-3 text-2xl font-black">No notifications</h2>
              <p className="mt-1 font-bold text-zinc-500">This filter is clear.</p>
            </div>
          </div>
        )}
      </section>
    </DashboardShell>
  )
}

function NotificationItem({ item, onClick, onDelete }) {
  const [Icon, tone] = TYPE_ICONS[item.notification_type] || TYPE_ICONS.system
  return (
    <div className={`group flex items-start gap-3 p-4 transition hover:bg-zinc-50 ${!item.is_read ? 'border-l-4 border-l-blue-500 bg-blue-50/40' : ''}`}>
      {/* Clickable content area */}
      <button onClick={onClick} className="flex flex-1 items-start gap-3 text-left min-w-0">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-md ${tone}`}>
          <Icon size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block ${item.is_read ? 'font-bold text-zinc-800' : 'font-black text-zinc-950'}`}>{item.title}</span>
          <span className="mt-1 block text-sm text-zinc-600">{item.message}</span>
          <span className="mt-1 block text-xs font-bold text-zinc-400">
            {formatNotificationTime(item.created_at)}
          </span>
        </span>
      </button>

      {/* Delete button — always visible on mobile, hover on desktop */}
      <button
        onClick={onDelete}
        className="shrink-0 grid h-8 w-8 place-items-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-600 transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
        aria-label="Delete notification"
        title="Delete"
      >
        <X size={16} />
      </button>
    </div>
  )
}
