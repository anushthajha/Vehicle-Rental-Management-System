import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Copy } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../context/AuthContext'
import { formatMoney } from '../../utils/searchData'
import { formatDateTime } from '../../utils/bookingUtils'

export default function BookingSuccessPage() {
  const [params] = useSearchParams()
  const { user } = useAuthStore()
  const ref = params.get('ref') || ''
  const summary = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem('sigfleet_last_booking_success') || '{}')
    } catch {
      return {}
    }
  }, [])

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-zinc-50 px-4 py-10">
      <div className="absolute inset-0 pointer-events-none">{Array.from({ length: 42 }).map((_, index) => <motion.span key={index} className="absolute h-2.5 w-2.5 rounded-full" style={{ left: `${(index * 37) % 100}%`, top: `${(index * 19) % 100}%`, background: ['#e31837', '#10b981', '#f59e0b', '#3b82f6'][index % 4] }} initial={{ scale: 0, y: 0 }} animate={{ scale: [0, 1, 0], y: [-20, 90] }} transition={{ duration: 1.4, delay: index * 0.02 }} />)}</div>
      <section className="relative w-full max-w-xl rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-xl">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 180 }}>
          <CheckCircle2 className="mx-auto text-emerald-600" size={82} />
        </motion.div>
        <h1 className="mt-5 text-4xl font-black text-zinc-950">Booking Confirmed!</h1>
        <div className="mt-5 inline-flex items-center gap-3 rounded-md bg-zinc-100 px-4 py-3 font-mono text-lg font-black text-zinc-950">{ref}<button onClick={() => navigator.clipboard?.writeText(ref)}><Copy size={17} /></button></div>
        <div className="mt-5 space-y-1 text-sm font-bold text-zinc-600">
          <p>{summary.car?.title}</p>
          {summary.pickup_datetime && <p>{formatDateTime(summary.pickup_datetime)} - {formatDateTime(summary.return_datetime)}</p>}
          {summary.total_amount && <p>Total paid: ₹{formatMoney(summary.total_amount)}</p>}
        </div>
        <p className="mt-5 text-sm font-bold text-zinc-500">A confirmation email has been sent to {user?.email || 'your email'}.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to={summary.id ? `/dashboard/bookings/${summary.id}` : '/dashboard/bookings'} className="rounded-md bg-sigfleet px-4 py-3 font-black text-white">View Booking Details</Link>
          <Link to="/search" className="rounded-md border border-zinc-300 px-4 py-3 font-black text-zinc-800">Explore More Cars</Link>
          <Link to="/" className="rounded-md border border-zinc-300 px-4 py-3 font-black text-zinc-800">Go Home</Link>
        </div>
      </section>
    </main>
  )
}
