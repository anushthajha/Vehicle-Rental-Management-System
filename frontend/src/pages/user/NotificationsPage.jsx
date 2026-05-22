import React, { useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck, CreditCard, FileCheck2, Info, Loader2, MessageSquare, Settings, Tag } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import api from '../../services/api'
import DashboardShell from './DashboardShell'

const FILTERS = ['all', 'unread', 'booking', 'payment', 'kyc', 'system']

const TYPE_ICONS = {
  booking: [Bell, 'bg-blue-50 text-blue-700'],
  payment: [CreditCard, 'bg-emerald-50 text-emerald-700'],
  kyc: [FileCheck2, 'bg-amber-50 text-amber-700'],
  system: [Settings, 'bg-zinc-100 text-zinc-700'],
  promotion: [Tag, 'bg-red-50 text-zoomcar'],
  review: [MessageSquare, 'bg-violet-50 text-violet-700'],
  host: [Info, 'bg-cyan-50 text-cyan-700'],
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

  return (
    <DashboardShell title="Notifications" eyebrow="Inbox" actions={<button onClick={markAll} className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-3 font-black"><CheckCheck size={18} /> Mark all as read</button>}>
      <div className="mb-5 flex flex-wrap gap-2">{FILTERS.map((item) => <button key={item} onClick={() => setFilter(item)} className={`rounded-md px-4 py-2 font-black capitalize ${filter === item ? 'bg-zoomcar text-white' : 'bg-white text-zinc-600'}`}>{item}</button>)}</div>

      <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        {loading ? <div className="grid h-80 place-items-center"><Loader2 className="animate-spin text-zoomcar" /></div> : items.length ? (
          <div className="divide-y divide-zinc-100">
            {items.map((item) => <NotificationItem key={item._id} item={item} onClick={() => openNotification(item)} />)}
            <div ref={sentinelRef} className="grid h-16 place-items-center">{loadingMore && <Loader2 className="animate-spin text-zoomcar" />}</div>
          </div>
        ) : (
          <div className="grid min-h-96 place-items-center text-center">
            <div><Bell className="mx-auto text-zinc-400" size={42} /><h2 className="mt-3 text-2xl font-black">No notifications</h2><p className="mt-1 font-bold text-zinc-500">This filter is clear.</p></div>
          </div>
        )}
      </section>
    </DashboardShell>
  )
}

function NotificationItem({ item, onClick }) {
  const [Icon, tone] = TYPE_ICONS[item.notification_type] || TYPE_ICONS.system
  return (
    <button onClick={onClick} className={`grid w-full gap-3 p-4 text-left transition hover:bg-zinc-50 sm:grid-cols-[48px_1fr_auto] ${!item.is_read ? 'border-l-4 border-l-blue-500 bg-blue-50/40' : ''}`}>
      <span className={`grid h-12 w-12 place-items-center rounded-md ${tone}`}><Icon size={22} /></span>
      <span>
        <span className={`block ${item.is_read ? 'font-bold text-zinc-800' : 'font-black text-zinc-950'}`}>{item.title}</span>
        <span className="mt-1 block text-sm text-zinc-600">{item.message}</span>
      </span>
      <span className="text-sm font-bold text-zinc-500">{item.created_at ? formatDistanceToNow(new Date(item.created_at), { addSuffix: true }) : ''}</span>
    </button>
  )
}
