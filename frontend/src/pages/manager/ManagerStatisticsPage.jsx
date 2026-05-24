import React, { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { downloadCsv, getManager, money } from './managerApi'

export default function ManagerStatisticsPage() {
  const [stats, setStats] = useState(null)
  const [perCar, setPerCar] = useState([])
  const [range, setRange] = useState('30d')

  useEffect(() => {
    Promise.all([getManager('/stats'), getManager('/earnings/per-car')]).then(([statsData, perCarData]) => {
      setStats(statsData)
      setPerCar(perCarData)
    })
  }, [range])

  const statusData = useMemo(() => [
    { name: 'Approved', value: Number(stats?.completed_rentals || 0) + Number(stats?.active_rentals || 0) },
    { name: 'Pending', value: Number(stats?.pending_requests || 0) },
    { name: 'Other', value: Math.max(Number(stats?.total_bookings || 0) - Number(stats?.completed_rentals || 0) - Number(stats?.active_rentals || 0) - Number(stats?.pending_requests || 0), 0) },
  ], [stats])

  if (!stats) return <div className="grid min-h-screen place-items-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-sigfleet" /></div>

  return (
    <div className="px-4 py-8">
      <section className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-black uppercase text-sigfleet">Rental Statistics</p><h1 className="text-3xl font-black">Performance analytics</h1></div>
          <div className="flex gap-2">
            {['7d', '30d', '3m', '6m', '1y'].map((item) => <button key={item} onClick={() => setRange(item)} className={`rounded-md px-3 py-2 text-sm font-black ${range === item ? 'bg-[#1E3A5F] text-white' : 'bg-white text-zinc-700'}`}>{item}</button>)}
            <button onClick={() => downloadCsv('manager-statistics.csv', [['Vehicle', 'Total Bookings', 'Revenue', 'Avg Rating'], ...perCar.map((car) => [car.title, car.trips, car.net, car.avg_rating])])} className="rounded-md bg-sigfleet px-3 py-2 text-sm font-black text-white">Download CSV Report</button>
          </div>
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <Chart title="Revenue Trend"><ResponsiveContainer width="100%" height={270}><AreaChart data={stats.monthly_bookings}><XAxis dataKey="month" /><YAxis /><Tooltip /><Area type="monotone" dataKey="revenue" stroke="#1E3A5F" fill="#DBEAFE" /></AreaChart></ResponsiveContainer></Chart>
          <Chart title="Bookings By Status"><ResponsiveContainer width="100%" height={270}><PieChart><Pie data={statusData} dataKey="value" innerRadius={65} outerRadius={100}>{statusData.map((item, index) => <Cell key={item.name} fill={['#16A34A', '#F59E0B', '#E31837'][index]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></Chart>
          <Chart title="Top Performing Vehicles"><ResponsiveContainer width="100%" height={270}><BarChart data={perCar.slice(0, 6)} layout="vertical"><XAxis type="number" /><YAxis dataKey="title" type="category" width={130} /><Tooltip /><Bar dataKey="net" fill="#E31837" /></BarChart></ResponsiveContainer></Chart>
          <Chart title="Average Rental Duration"><ResponsiveContainer width="100%" height={270}><BarChart data={perCar.slice(0, 6).map((car) => ({ ...car, avg_days: car.trips ? 1 : 0 }))}><XAxis dataKey="title" hide /><YAxis /><Tooltip /><Bar dataKey="avg_days" fill="#1E3A5F" /></BarChart></ResponsiveContainer></Chart>
        </div>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm"><thead className="text-xs uppercase text-zinc-500"><tr><th className="p-3">Vehicle</th><th>Total Bookings</th><th>Revenue</th><th>Avg Rating</th></tr></thead><tbody>{perCar.map((car) => <tr key={car.vehicle_id} className="border-t border-zinc-100"><td className="p-3 font-black">{car.title}</td><td>{car.trips}</td><td>{money(car.net)}</td><td>{car.avg_rating} ★</td></tr>)}</tbody></table>
        </div>
      </section>
    </div>
  )
}

function Chart({ title, children }) {
  return <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="mb-4 font-black">{title}</h2>{children}</section>
}
