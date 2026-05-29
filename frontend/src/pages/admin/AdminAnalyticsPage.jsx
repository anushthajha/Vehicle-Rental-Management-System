import React, { useEffect, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { Download } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoney, getAdmin } from './adminApi'

const colors = ['#E31837', '#111827', '#16A34A', '#F59E0B', '#2563EB', '#7C3AED']

function ChartBox({ title, empty, children }) {
  const ref = useRef(null)
  const exportPng = async () => {
    const canvas = await html2canvas(ref.current, { backgroundColor: '#ffffff' })
    const link = document.createElement('a')
    link.download = `${title.toLowerCase().replaceAll(' ', '-')}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }
  return <section ref={ref} className="min-h-80 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><h3 className="font-black">{title}</h3><button title="Export PNG" onClick={exportPng} className="rounded-md border border-zinc-200 p-2 hover:border-[#E31837]"><Download size={16} /></button></div>{empty ? <div className="grid h-[260px] place-items-center rounded-md bg-zinc-50 text-sm font-black text-zinc-500">No data available for this period</div> : children}</section>
}

function hasSignal(rows, keys) {
  return rows.some((row) => keys.some((key) => Number(row?.[key] || 0) > 0))
}

export default function AdminAnalyticsPage() {
  const [preset, setPreset] = useState('30d')
  const [data, setData] = useState({ revenue: [], cities: [], topCars: [], categories: [], funnel: [], users: [] })
  useEffect(() => {
    Promise.all([
      getAdmin('/analytics/revenue', { year: new Date().getFullYear() }).catch((err) => {
        console.error("Revenue trend loading failed", err);
        return [];
      }),
      getAdmin('/analytics/cities').catch((err) => {
        console.error("Top cities loading failed", err);
        return [];
      }),
      getAdmin('/analytics/top-vehicles', { limit: 10 }).catch((err) => {
        console.error("Top vehicles loading failed", err);
        return [];
      }),
      getAdmin('/analytics/category-distribution').catch((err) => {
        console.error("Categories loading failed", err);
        return [];
      }),
      getAdmin('/analytics/booking-funnel').catch((err) => {
        console.error("Booking funnel loading failed", err);
        return [];
      }),
      getAdmin('/analytics/new-users').catch((err) => {
        console.error("New users trend loading failed", err);
        return [];
      }),
    ]).then(([revenue, cities, topCars, categories, funnel, users]) => setData({
      revenue: revenue || [],
      cities: cities || [],
      topCars: topCars || [],
      categories: categories || [],
      funnel: funnel || [],
      users: users || [],
    }))
  }, [preset])

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-black">Analytics</h2><p className="text-sm font-bold text-zinc-500">Revenue, geography, vehicles, categories, funnel, and user growth.</p></div><div className="flex rounded-md border border-zinc-200 bg-white p-1">{['7d', '30d', '3m', '6m', '1y', 'custom'].map((item) => <button key={item} onClick={() => setPreset(item)} className={`rounded px-3 py-2 text-sm font-black ${preset === item ? 'bg-[#E31837] text-white' : 'text-zinc-600'}`}>{item}</button>)}</div></div>
    <section className="grid gap-5 xl:grid-cols-2">
      <ChartBox title="Revenue Trend" empty={!hasSignal(data.revenue, ['gross', 'platform_fee'])}><ResponsiveContainer width="100%" height={260}><ComposedChart data={data.revenue}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Legend /><Bar dataKey="gross" fill="#111827" /><Line dataKey="platform_fee" stroke="#E31837" strokeWidth={3} /></ComposedChart></ResponsiveContainer></ChartBox>
      <ChartBox title="Top Cities" empty={!hasSignal(data.cities, ['booking_count', 'revenue'])}><ResponsiveContainer width="100%" height={260}><BarChart data={data.cities} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="city" width={90} /><Tooltip /><Bar dataKey="booking_count" fill="#E31837" /><Bar dataKey="revenue" fill="#111827" /></BarChart></ResponsiveContainer></ChartBox>
      <ChartBox title="Vehicle Category Distribution" empty={!hasSignal(data.categories, ['value'])}><ResponsiveContainer width="100%" height={260}><PieChart><Pie data={data.categories} dataKey="value" outerRadius={95} label>{data.categories.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></ChartBox>
      <ChartBox title="Booking Funnel" empty={!hasSignal(data.funnel, ['count'])}><ResponsiveContainer width="100%" height={260}><BarChart data={data.funnel} layout="vertical"><XAxis type="number" /><YAxis type="category" dataKey="stage" width={90} /><Tooltip /><Bar dataKey="count" fill="#E31837" /></BarChart></ResponsiveContainer></ChartBox>
      <ChartBox title="New Users Trend" empty={!hasSignal(data.users, ['users'])}><ResponsiveContainer width="100%" height={260}><AreaChart data={data.users}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Area dataKey="users" fill="#FEE2E2" stroke="#E31837" strokeWidth={3} /></AreaChart></ResponsiveContainer></ChartBox>
      <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"><h3 className="mb-4 font-black">Top 10 Cars</h3><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-zinc-500"><tr><th className="py-2">Rank</th><th>Vehicle</th><th>Manager</th><th>Trips</th><th>Revenue</th><th>Rating</th></tr></thead><tbody>{data.topCars.map((car, index) => <tr key={car.id} className="border-t border-zinc-100"><td className="py-3 font-black">{index + 1}</td><td className="font-bold"><div className="flex items-center gap-2"><img alt="" src={car.image || '/vite.svg'} className="h-9 w-12 rounded object-cover" />{car.title}</div></td><td>{car.manager_name}</td><td>{car.trips}</td><td className="font-black">{formatMoney(car.revenue)}</td><td>{car.rating}</td></tr>)}</tbody></table></div>
    </section>
  </div>
}
