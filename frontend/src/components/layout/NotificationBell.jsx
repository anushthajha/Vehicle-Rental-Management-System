import React, { useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck, CreditCard, FileCheck2, Info, MessageSquare, Settings, Tag } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../../services/api'

const ICONS = {
  booking: [Bell, 'text-blue-700 bg-blue-50'],
  payment: [CreditCard, 'text-emerald-700 bg-emerald-50'],
  kyc: [FileCheck2, 'text-amber-700 bg-amber-50'],
  review: [MessageSquare, 'text-violet-700 bg-violet-50'],
  promotion: [Tag, 'text-sigfleet bg-red-50'],
  manager: [Info, 'text-cyan-700 bg-cyan-50'],
  system: [Settings, 'text-zinc-700 bg-zinc-100'],
}

// How often to poll the unread count (ms)
const POLL_INTERVAL_MS = 60000
// Don't re-fetch the panel list if it was loaded less than this many ms ago
const PANEL_STALE_MS = 30000

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

export default function NotificationBell() {
  const navigate = useNavigate()
  const previousCount = useRef(0)
  const lastPanelFetch = useRef(0)
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  const [items, setItems] = useState([])

  // Fetch only the unread count — lightweight, used for the badge
  async function loadCount(showToast = false) {
    try {
      const response = await api.get('/notifications/unread-count')
      const next = response.data.count || 0
      if (showToast && next > previousCount.current) {
        toast(`You have ${next - previousCount.current} new notification${next - previousCount.current > 1 ? 's' : ''}`)
      }
      previousCount.current = next
      setCount(next)
    } catch {
      // Silently ignore — badge just won't update
    }
  }

  // Fetch the full panel list — only called when dropdown is opened and data is stale
  async function loadPanel() {
    try {
      const response = await api.get('/notifications', { params: { limit: 8 } })
      setItems(response.data.notifications || [])
      setCount(response.data.total_unread ?? response.data.unread_count ?? 0)
      lastPanelFetch.current = Date.now()
    } catch {
      // Silently ignore
    }
  }

  // Poll unread count every 60s — only the lightweight count endpoint, not the full list
  useEffect(() => {
    loadCount()
    const timer = window.setInterval(() => loadCount(true), POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [])

  // Load panel only when opened AND data is stale (>30s old)
  // This prevents a network call every time the user opens/closes the dropdown
  useEffect(() => {
    if (open && Date.now() - lastPanelFetch.current > PANEL_STALE_MS) {
      loadPanel()
    }
  }, [open])

  async function openItem(item) {
    if (!item.is_read) {
      await api.patch(`/notifications/${item._id}/read`).catch(() => {})
      setCount((v) => Math.max(v - 1, 0))
      setItems((current) => current.map((n) => n._id === item._id ? { ...n, is_read: true } : n))
    }
    setOpen(false)
    if (item.action_url) navigate(item.action_url)
  }

  async function markAll() {
    await api.patch('/notifications/mark-all-read').catch(() => {})
    setItems((current) => current.map((item) => ({ ...item, is_read: true })))
    setCount(0)
  }

  async function deleteAll() {
    await api.delete('/notifications/all').catch(() => {})
    setItems([])
    setCount(0)
    lastPanelFetch.current = 0
    toast.success('All notifications deleted')
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative grid h-11 w-11 place-items-center rounded-md border border-zinc-200 bg-white text-zinc-700"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-sigfleet px-1 text-[10px] font-black text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-100 p-3">
            <p className="font-black">Notifications</p>
            <button
              onClick={markAll}
              disabled={count === 0}
              className={`inline-flex items-center gap-1 text-xs font-black ${count > 0 ? 'text-sigfleet' : 'text-zinc-300 cursor-not-allowed'}`}
            >
              <CheckCheck size={15} /> Mark all read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length
              ? items.map((item) => <NotificationRow key={item._id} item={item} onClick={() => openItem(item)} />)
              : <div className="p-6 text-center font-bold text-zinc-500">No notifications</div>
            }
          </div>
          <div className="grid grid-cols-2 border-t border-zinc-100 text-center text-sm font-black">
            <button onClick={deleteAll} className="p-3 text-red-600 hover:bg-red-50 transition">Delete all</button>
            <Link onClick={() => setOpen(false)} to="/dashboard/notifications" className="p-3 text-sigfleet">
              View all
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function NotificationRow({ item, onClick }) {
  const [Icon, tone] = ICONS[item.notification_type] || ICONS.system
  return (
    <button
      onClick={onClick}
      className={`grid w-full grid-cols-[36px_1fr] gap-3 p-3 text-left hover:bg-zinc-50 ${!item.is_read ? 'border-l-4 border-l-blue-500 bg-blue-50/50' : ''}`}
    >
      <span className={`grid h-9 w-9 place-items-center rounded-md ${tone}`}><Icon size={18} /></span>
      <span className="min-w-0">
        <span className="block truncate font-black text-zinc-950">{item.title}</span>
        <span className="mt-1 block text-xs font-bold text-zinc-500">
          {formatNotificationTime(item.created_at)}
        </span>
      </span>
    </button>
  )
}
