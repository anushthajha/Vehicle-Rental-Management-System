import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CalendarDays, Car, IndianRupee, Plus, Star, Trophy, Wallet } from 'lucide-react'
import api from '../../services/api'
import { getHost, money } from './hostApi'
import { formatDateTime, moneyLabel, statusClass } from '../../utils/bookingUtils'

function Count({ value, formatter = (x) => x }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const target = Number(value || 0)
    const id = window.setInterval(() => setShown((current) => {
      const next = current + Math.max(target / 16, 1)
      if (next >= target) {
        window.clearInterval(id)
        return target
      }
      return next
    }), 20)
    return () => window.clearInterval(id)
  }, [value])
  return formatter(Math.round(shown))
}

export default function HostDashboardPage() {
  const [summary, setSummary] = useState(null)
  const [profile, setProfile] = useState(null)
  const [monthly, setMonthly] = useState([])
  const [cars, setCars] = useState([])
  const [bookings, setBookings] = useState([])

  async function load() {
    const [summaryData, profileData, monthlyData, carsData, bookingsData] = await Promise.all([
      getHost('/earnings/summary'),
      getHost('/profile'),
      getHost('/earnings/monthly', { year: new Date().getFullYear() }),
      api.get('/cars/manager/cars'),
      api.get('/bookings/', { params: { as_role: 'vehicle_manager', limit: 5 } }),
    ])
    setSummary(summaryData)
    setProfile(profileData)
    setMonthly(monthlyData.slice(-6))
    setCars(carsData.data.cars || [])
    setBookings(bookingsData.data.bookings || [])
  }

  useEffect(() => { load() }, [])
  const topTrips = useMemo(() => cars.slice().sort((a, b) => Number(b.total_trips || 0) - Number(a.total_trips || 0)).slice(0, 3).map((car) => ({ name: car.title, value: car.total_trips || 0 })), [cars])
  if (!summary) return <div className="grid min-h-screen place-items-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-sigfleet" /></div>

  return <div className="px-4 py-8"><section className="mx-auto max-w-7xl space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-black uppercase text-sigfleet">Manager Dashboard</p><h1 className="text-3xl font-black">Your hosting cockpit</h1></div><div className="flex gap-2"><Link to="/manager/cars/new" className="inline-flex items-center gap-2 rounded-md bg-sigfleet px-4 py-3 font-black text-white"><Plus size={18} /> List New Car</Link><Link to="/manager/payouts" className="rounded-md bg-zinc-950 px-4 py-3 font-black text-white">Withdraw Earnings</Link></div></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Stat icon={IndianRupee} label="This Month Earnings" value={<Count value={summary.total_earned_this_month} formatter={money} />} /><Stat icon={CalendarDays} label="Total Trips" value={<Count value={summary.total_trips_completed} />} /><Stat icon={Car} label="Active Listings" value={<Count value={summary.active_listings} />} /><Stat icon={Star} label="Avg Car Rating" value={`${summary.avg_car_rating} ★`} /><Stat icon={Wallet} label="Pending Requests" value={summary.pending_requests} danger={summary.pending_requests > 0} /></div>
    {profile?.profile?.is_superhost && <div className="rounded-lg bg-gradient-to-r from-amber-400 to-yellow-600 p-5 text-white shadow-sm"><div className="flex items-center gap-3"><Trophy size={28} /><div><h2 className="text-xl font-black">You're a Superhost!</h2><p className="font-bold">Criteria: {profile.stats.superhost_criteria.completed_trips} trips, {profile.stats.superhost_criteria.average_rating} rating, {profile.stats.superhost_criteria.acceptance_rate}% acceptance, {profile.stats.superhost_criteria.host_cancellations_90d} recent host cancellations.</p></div></div></div>}
    <div className="grid gap-5 xl:grid-cols-2"><Chart title="Earnings Last 6 Months"><ResponsiveContainer width="100%" height={260}><BarChart data={monthly}><XAxis dataKey="month" /><YAxis /><Tooltip /><Bar dataKey="net" fill="#E31837" /></BarChart></ResponsiveContainer></Chart><Chart title="Trips Per Car">{topTrips.length ? <ResponsiveContainer width="100%" height={260}><PieChart><Pie data={topTrips} dataKey="value" innerRadius={60} outerRadius={95}>{topTrips.map((item, index) => <Cell key={item.name} fill={['#E31837', '#111827', '#F59E0B'][index]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <Empty />}</Chart></div>
    <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]"><section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-black">Active Listings</h2><Link to="/manager/cars" className="text-sm font-black text-sigfleet">View All</Link></div><div className="mt-4 grid gap-3">{cars.slice(0, 3).map((car) => <div key={car.id} className="flex items-center gap-3 rounded-md border border-zinc-200 p-3"><img alt="" src={car.primary_image_url || '/vite.svg'} className="h-16 w-20 rounded object-cover" /><div className="min-w-0 flex-1"><p className="truncate font-black">{car.title}</p><p className="text-sm font-bold text-zinc-500">{car.average_rating} ★ · {car.total_trips} trips</p></div><span className={`rounded-full px-2 py-1 text-xs font-black ${car.is_available && car.is_approved ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{car.is_available && car.is_approved ? 'Active' : 'Review'}</span></div>)}</div></section><section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="font-black">Recent Bookings</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="text-xs uppercase text-zinc-500"><tr><th className="py-2">Guest</th><th>Car</th><th>Dates</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>{bookings.map((booking) => <tr key={booking.id} className="border-t border-zinc-100"><td className="py-3 font-bold">{booking.counterparty?.name}</td><td>{booking.car?.title}</td><td>{formatDateTime(booking.pickup_datetime)}</td><td className="font-black">{moneyLabel(booking.host_earnings)}</td><td><span className={`rounded-full px-2 py-1 text-xs font-black capitalize ${statusClass(booking.status)}`}>{booking.status}</span></td><td><Link to="/manager/bookings" className="font-black text-sigfleet">Open</Link></td></tr>)}</tbody></table></div></section></div>
  </section></div>
}

function Stat({ icon: Icon, label, value, danger }) {
  return <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"><Icon className={danger ? 'text-sigfleet' : 'text-zinc-900'} size={23} /><p className="mt-4 text-sm font-bold text-zinc-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>
}

function Chart({ title, children }) {
  return <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="mb-4 font-black">{title}</h2>{children}</section>
}

function Empty() {
  return <div className="grid h-64 place-items-center text-sm font-bold text-zinc-500">No trips yet.</div>
}
