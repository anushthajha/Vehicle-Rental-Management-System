import React, { useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck, CreditCard, FileCheck2, Info, MessageSquare, Settings, Tag } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import api from '../../services/api'

const ICONS = {
  booking: [Bell, 'text-blue-700 bg-blue-50'],
  payment: [CreditCard, 'text-emerald-700 bg-emerald-50'],
  kyc: [FileCheck2, 'text-amber-700 bg-amber-50'],
  review: [MessageSquare, 'text-violet-700 bg-violet-50'],
  promotion: [Tag, 'text-sigfleet bg-red-50'],
  host: [Info, 'text-cyan-700 bg-cyan-50'],
  system: [Settings, 'text-zinc-700 bg-zinc-100'],
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const previousCount = useRef(0)
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  const [items, setItems] = useState([])

  async function loadCount(showToast = false) {
    const response = await api.get('/notifications/unread-count')
    const next = response.data.count || 0
    if (showToast && next > previousCount.current) toast(`You have ${next - previousCount.current} new notifications`)
    previousCount.current = next
    setCount(next)
  }

  async function loadPanel() {
    const response = await api.get('/notifications', { params: { limit: 8 } })
    setItems(response.data.notifications || [])
    setCount(response.data.total_unread ?? response.data.unread_count ?? 0)
  }

  useEffect(() => {
    loadCount()
    const timer = window.setInterval(() => loadCount(true), 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (open) loadPanel()
  }, [open])

  async function openItem(item) {
    if (!item.is_read) {
      await api.patch(`/notifications/${item._id}/read`)
      setCount((value) => Math.max(value - 1, 0))
    }
    setOpen(false)
    if (item.action_url) navigate(item.action_url)
  }

  async function markAll() {
    await api.patch('/notifications/mark-all-read')
    setItems((current) => current.map((item) => ({ ...item, is_read: true })))
    setCount(0)
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((value) => !value)} className="relative grid h-11 w-11 place-items-center rounded-md border border-zinc-200 bg-white text-zinc-700" aria-label="Notifications">
        <Bell size={20} />
        {count > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-sigfleet px-1 text-[10px] font-black text-white">{count > 9 ? '9+' : count}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-100 p-3"><p className="font-black">Notifications</p><button onClick={markAll} className="inline-flex items-center gap-1 text-xs font-black text-sigfleet"><CheckCheck size={15} /> Mark all read</button></div>
          <div className="max-h-96 overflow-y-auto">
            {items.length ? items.map((item) => <NotificationRow key={item._id} item={item} onClick={() => openItem(item)} />) : <div className="p-6 text-center font-bold text-zinc-500">No notifications</div>}
          </div>
          <div className="grid grid-cols-2 border-t border-zinc-100 text-center text-sm font-black">
            <button onClick={markAll} className="p-3 text-zinc-600">Mark all read</button>
            <Link onClick={() => setOpen(false)} to="/dashboard/notifications" className="p-3 text-sigfleet">View all notifications</Link>
          </div>
        </div>
      )}
    </div>
  )
}

function NotificationRow({ item, onClick }) {
  const [Icon, tone] = ICONS[item.notification_type] || ICONS.system
  return (
    <button onClick={onClick} className={`grid w-full grid-cols-[36px_1fr] gap-3 p-3 text-left hover:bg-zinc-50 ${!item.is_read ? 'border-l-4 border-l-blue-500 bg-blue-50/50' : ''}`}>
      <span className={`grid h-9 w-9 place-items-center rounded-md ${tone}`}><Icon size={18} /></span>
      <span className="min-w-0"><span className="block truncate font-black text-zinc-950">{item.title}</span><span className="mt-1 block text-xs font-bold text-zinc-500">{item.created_at ? formatDistanceToNow(new Date(item.created_at), { addSuffix: true }) : ''}</span></span>
    </button>
  )
}
