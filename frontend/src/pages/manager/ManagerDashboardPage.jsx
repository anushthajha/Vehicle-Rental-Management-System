import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CalendarDays, Car as Vehicle, CheckCircle2, Clock, IndianRupee, Plus, Route, Star, Trophy } from 'lucide-react'
import api from '../../services/api'
import { getManager, money } from './managerApi'
import { formatDateTime, moneyLabel, statusClass } from '../../utils/bookingUtils'
import { useAuth } from '../../context/AuthContext'

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

export default function ManagerDashboardPage() {
  const [summary, setSummary] = useState(null)
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [monthly, setMonthly] = useState([])
  const [vehicles, setCars] = useState([])
  const [bookings, setBookings] = useState([])

  async function load() {
    const [summaryData, profileData, monthlyData, carsData, bookingsData] = await Promise.all([
      getManager('/stats'),
      getManager('/profile'),
      getManager('/earnings/monthly', { year: new Date().getFullYear() }),
      api.get('/vehicles/manager/vehicles'),
      api.get('/bookings/', { params: { as_role: 'vehicle_manager', limit: 5 } }),
    ])
    setSummary(summaryData)
    setProfile(profileData)
    setMonthly(monthlyData.slice(-6))
    setCars(carsData.data.vehicles || [])
    setBookings(bookingsData.data.bookings || [])
  }

  useEffect(() => { load() }, [])
  const topTrips = useMemo(() => vehicles.slice().sort((a, b) => Number(b.total_trips || 0) - Number(a.total_trips || 0)).slice(0, 3).map((car) => ({ name: car.title, value: car.total_trips || 0 })), [vehicles])
  if (!summary) return <div className="grid min-h-screen place-items-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-sigfleet" /></div>

  const inactiveVehicles = Math.max(Number(summary.total_vehicles || 0) - Number(summary.active_vehicles || 0), 0)
  const acceptanceTone = Number(summary.acceptance_rate || 0) >= 85 ? 'text-emerald-600' : Number(summary.acceptance_rate || 0) >= 70 ? 'text-amber-600' : 'text-red-600'

  return <div className="px-4 py-8"><section className="mx-auto max-w-7xl space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-black uppercase text-sigfleet">Manager Dashboard</p><h1 className="text-3xl font-black">Welcome back, {user?.full_name || profile?.profile?.user?.full_name || 'Manager'}</h1><span className="mt-2 inline-flex rounded-full bg-[#1E3A5F] px-3 py-1 text-xs font-black text-white">Vehicle Manager</span></div><div className="flex gap-2"><Link to="/manager/vehicles/add" className="inline-flex items-center gap-2 rounded-md bg-sigfleet px-4 py-3 font-black text-white"><Plus size={18} /> Add New Vehicle</Link><Link to="/manager/payouts" className="rounded-md bg-zinc-950 px-4 py-3 font-black text-white">Withdraw Earnings</Link></div></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Stat icon={Vehicle} label="My Vehicles" value={<Count value={summary.total_vehicles} />} sub={`Active: ${summary.active_vehicles || 0} | Inactive: ${inactiveVehicles}`} /><Stat icon={Clock} label="Pending Requests" value={summary.pending_requests} sub="Awaiting your approval" danger={summary.pending_requests > 0} to="/manager/bookings?tab=pending" /><Stat icon={Route} label="Active Rentals" value={summary.active_rentals} sub="Currently on the road" tone="text-emerald-600" to="/manager/bookings?tab=active" /><Stat icon={IndianRupee} label="This Month Revenue" value={money(summary.this_month_revenue)} sub="Net after platform fee" /><Stat icon={CheckCircle2} label="Acceptance Rate" value={`${summary.acceptance_rate || 0}%`} sub="Last 30 days" tone={acceptanceTone} /></div>
    {profile?.profile?.is_super_manager && <div className="rounded-lg bg-gradient-to-r from-amber-400 to-yellow-600 p-5 text-white shadow-sm"><div className="flex items-center gap-3"><Trophy size={28} /><div><h2 className="text-xl font-black">You're a Super Manager!</h2><p className="font-bold">Criteria: {profile.stats.super_manager_criteria.completed_trips} trips, {profile.stats.super_manager_criteria.average_rating} rating, {profile.stats.super_manager_criteria.acceptance_rate}% acceptance, {profile.stats.super_manager_criteria.manager_cancellations_90d} recent manager cancellations.</p></div></div></div>}
    <div className="grid gap-5 xl:grid-cols-2"><Chart title="Rental Statistics"><ResponsiveContainer width="100%" height={260}><BarChart data={summary.monthly_bookings || monthly}><XAxis dataKey="month" /><YAxis /><Tooltip /><Bar dataKey="approved" fill="#16A34A" /><Bar dataKey="rejected" fill="#E31837" /></BarChart></ResponsiveContainer></Chart><Chart title="Trips Per Vehicle">{topTrips.length ? <ResponsiveContainer width="100%" height={260}><PieChart><Pie data={topTrips} dataKey="value" innerRadius={60} outerRadius={95}>{topTrips.map((item, index) => <Cell key={item.name} fill={['#E31837', '#1E3A5F', '#F59E0B'][index]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <Empty />}</Chart></div>
    <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]"><section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-black">Active Listings</h2><Link to="/manager/vehicles" className="text-sm font-black text-sigfleet">View All</Link></div><div className="mt-4 grid gap-3">{vehicles.slice(0, 3).map((car) => <div key={car.id} className="flex items-center gap-3 rounded-md border border-zinc-200 p-3"><img alt="" src={car.primary_image_url || '/vite.svg'} className="h-16 w-20 rounded object-cover" /><div className="min-w-0 flex-1"><p className="truncate font-black">{car.title}</p><p className="text-sm font-bold text-zinc-500">{car.average_rating} ★ · {car.total_trips} trips</p></div><span className={`rounded-full px-2 py-1 text-xs font-black ${car.is_available && car.is_approved ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{car.is_available && car.is_approved ? 'Active' : 'Review'}</span></div>)}</div></section><section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="font-black">Recent Bookings</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="text-xs uppercase text-zinc-500"><tr><th className="py-2">Customer</th><th>Vehicle</th><th>Dates</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>{bookings.map((booking) => <tr key={booking.id} className="border-t border-zinc-100"><td className="py-3 font-bold">{booking.counterparty?.name}</td><td>{booking.car?.title}</td><td>{formatDateTime(booking.pickup_datetime)}</td><td className="font-black">{moneyLabel(booking.manager_earnings)}</td><td><span className={`rounded-full px-2 py-1 text-xs font-black capitalize ${statusClass(booking.status)}`}>{booking.status}</span></td><td><Link to="/manager/bookings" className="font-black text-sigfleet">Open</Link></td></tr>)}</tbody></table></div></section></div>
  </section></div>
}

function Stat({ icon: Icon, label, value, sub, danger, tone = 'text-zinc-900', to }) {
  const body = <><Icon className={danger ? 'text-sigfleet' : tone} size={23} /><p className="mt-4 text-sm font-bold text-zinc-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p>{sub && <p className="mt-1 text-xs font-bold text-zinc-500">{sub}</p>}</>
  return to ? <Link to={to} className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">{body}</Link> : <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">{body}</div>
}

function Chart({ title, children }) {
  return <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="mb-4 font-black">{title}</h2>{children}</section>
}

function Empty() {
  return <div className="grid h-64 place-items-center text-sm font-bold text-zinc-500">No trips yet.</div>
}
