import { useEffect, useRef, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import api from '../../services/api'
import { useAuthStore } from '../../context/AuthContext'

export default function DailyBriefBanner() {
  const { user } = useAuthStore()
  const [brief, setBrief] = useState(null)
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)
  const showTimerRef = useRef(null)
  const dismissTimerRef = useRef(null)
  const seenRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function fetchBrief() {
      try {
        const response = await api.get('/agent/daily-brief')
        if (!cancelled && response.data?.summary) {
          const shownKey = `daily_brief_shown:${user?.id || 'user'}:${response.data.date || 'today'}`
          if (sessionStorage.getItem(shownKey)) return
          setBrief(response.data)
          showTimerRef.current = window.setTimeout(() => {
            if (!cancelled) setVisible(true)
          }, 800)
        }
      } catch (err) {
        console.log('[DailyBrief] Could not fetch:', err)
      }
    }

    fetchBrief()
    return () => {
      cancelled = true
      window.clearTimeout(showTimerRef.current)
      window.clearTimeout(dismissTimerRef.current)
    }
  }, [user?.id])

  useEffect(() => {
    if (!visible || exiting) return undefined
    dismissTimerRef.current = window.setTimeout(() => {
      handleDismiss()
    }, 8000)
    return () => window.clearTimeout(dismissTimerRef.current)
  }, [visible, exiting])

  function markSeen() {
    if (seenRef.current) return
    seenRef.current = true
    if (brief) {
      sessionStorage.setItem(`daily_brief_shown:${user?.id || 'user'}:${brief.date || 'today'}`, '1')
    }
    api.post('/agent/daily-brief/seen').catch(() => {})
  }

  function handleDismiss() {
    if (!brief || exiting) return
    window.clearTimeout(dismissTimerRef.current)
    setExiting(true)
    markSeen()
    window.setTimeout(() => {
      setVisible(false)
      setBrief(null)
      setExiting(false)
    }, 400)
  }

  if (!visible || !brief) return null

  return (
    <div
      className={`relative mb-6 overflow-hidden rounded-lg bg-gradient-to-r from-red-600 via-red-500 to-orange-500 shadow-lg transition-all duration-300 ease-out ${exiting ? 'scale-[0.98] -translate-y-2 opacity-0' : 'scale-100 translate-y-0 opacity-100'}`}
    >
      <div className="absolute inset-0 opacity-10">
        <div className="absolute right-0 top-0 h-64 w-64 -translate-y-32 translate-x-32 rounded-full bg-white" />
        <div className="absolute bottom-0 left-0 h-48 w-48 -translate-x-24 translate-y-24 rounded-full bg-white" />
      </div>

      <div className="relative flex items-start justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/20">
            <Sparkles className="text-white" size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-black uppercase tracking-wide text-white/75">Your Daily Brief</p>
            <p className="text-sm font-semibold leading-relaxed text-white">{brief.summary}</p>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/20 text-white transition-colors hover:bg-white/30"
          aria-label="Dismiss daily brief"
        >
          <X size={15} />
        </button>
      </div>

      {!exiting && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
          <div className="h-full origin-left bg-white/60 daily-brief-progress" />
        </div>
      )}
    </div>
  )
}
