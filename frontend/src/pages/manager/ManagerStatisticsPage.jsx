import React, { useEffect, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { downloadCsv, getManager, money } from './managerApi'

export default function ManagerStatisticsPage() {
  const [stats, setStats] = useState(null)
  const [perCar, setPerCar] = useState([])
  const [revenueData, setRevenueData] = useState([])
  const [bookingsData, setBookingsData] = useState([])
  const [range, setRange] = useState('30d')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getManager('/stats', { range }).catch(() => null),
      getManager('/earnings/per-car').catch(() => []),
      getManager('/analytics/revenue').catch(() => []),
      getManager('/analytics/bookings').catch(() => []),
    ]).then(([statsData, perCarData, revData, bkData]) => {
      setStats(statsData || {
        total_vehicles: 0, active_vehicles: 0, total_bookings: 0,
        pending_requests: 0, active_rentals: 0, completed_rentals: 0,
        total_revenue: 0, this_month_revenue: 0, acceptance_rate: 0,
        avg_vehicle_rating: 0, monthly_bookings: [], recent_bookings: [],
      })
      setPerCar(Array.isArray(perCarData) ? perCarData : [])
      setRevenueData(Array.isArray(revData) ? revData : [])
      setBookingsData(Array.isArray(bkData) ? bkData : [])
      setLoading(false)
    })
  }, [range])

  // statusData kept for potential future use
  const statusData = [
    { name: 'Completed', value: Number(stats?.completed_rentals || 0) },
    { name: 'Active', value: Number(stats?.active_rentals || 0) },
    { name: 'Pending', value: Number(stats?.pending_requests || 0) },
  ]

  if (loading) {
    return (
      <div className="grid min-h-[400px] place-items-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-[#E31837]" />
      </div>
    )
  }

  return (
    <div className="px-4 py-8">
      <section className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase text-[#E31837]">Rental Statistics</p>
            <h1 className="text-3xl font-black">Performance analytics</h1>
          </div>
          <div className="flex gap-2">
            {['7d', '30d', '3m', '6m', '1y'].map((item) => (
              <button
                key={item}
                onClick={() => setRange(item)}
                className={`rounded-md px-3 py-2 text-sm font-black transition-all ${
                  range === item ? 'bg-zinc-950 text-white shadow' : 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                {item}
              </button>
            ))}
            <button
              onClick={() =>
                downloadCsv('manager-statistics.csv', [
                  ['Vehicle', 'Total Bookings', 'Revenue', 'Avg Rating'],
                  ...perCar.map((car) => [car.title, car.trips, car.net, car.avg_rating]),
                ])
              }
              className="rounded-md bg-[#E31837] px-3 py-2 text-sm font-black text-white hover:bg-red-700 transition"
            >
              Download CSV Report
            </button>
          </div>
        </div>

        {/* Stats Grid Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold text-zinc-500 uppercase">Total Revenue</p>
            <h3 className="text-2xl font-black mt-1">{money(stats?.total_revenue)}</h3>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold text-zinc-500 uppercase">Bookings handled</p>
            <h3 className="text-2xl font-black mt-1">{stats?.total_bookings}</h3>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold text-zinc-500 uppercase">Acceptance rate</p>
            <h3 className="text-2xl font-black mt-1">{stats?.acceptance_rate}%</h3>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold text-zinc-500 uppercase">Vehicle rating</p>
            <h3 className="text-2xl font-black mt-1">{stats?.avg_vehicle_rating} ★</h3>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <Chart title="Revenue Trend" empty={!hasSignal(revenueData.length ? revenueData : (stats?.monthly_bookings || []), ['value', 'revenue'])}>
            <ResponsiveContainer width="100%" height={270}>
              <AreaChart data={revenueData.length ? revenueData : (stats?.monthly_bookings || [])}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#E31837" fill="#FEE2E2" name="Revenue (₹)" />
                <Area type="monotone" dataKey="revenue" stroke="#E31837" fill="#FEE2E2" name="Revenue (₹)" />
              </AreaChart>
            </ResponsiveContainer>
          </Chart>
          <Chart title="Bookings By Month" empty={!hasSignal(bookingsData.length ? bookingsData : (stats?.monthly_bookings || []), ['value', 'approved'])}>
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={bookingsData.length ? bookingsData : (stats?.monthly_bookings || [])}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#1F2937" name="Bookings" />
                <Bar dataKey="approved" fill="#10B981" name="Approved" />
              </BarChart>
            </ResponsiveContainer>
          </Chart>
          <Chart title="Top Performing Vehicles" empty={!hasSignal(perCar, ['net'])}>
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={perCar.slice(0, 6)} layout="vertical">
                <XAxis type="number" />
                <YAxis dataKey="title" type="category" width={130} />
                <Tooltip />
                <Bar dataKey="net" fill="#E31837" />
              </BarChart>
            </ResponsiveContainer>
          </Chart>
          <Chart title="Average Rental Duration" empty={!hasSignal(perCar, ['trips'])}>
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={perCar.slice(0, 6).map((car) => ({ ...car, avg_days: car.trips ? 1 : 0 }))}>
                <XAxis dataKey="title" hide />
                <YAxis />
                <Tooltip />
                <Bar dataKey="avg_days" fill="#1F2937" />
              </BarChart>
            </ResponsiveContainer>
          </Chart>
        </div>

        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="p-4">Vehicle</th>
                <th className="p-4">Total Bookings</th>
                <th className="p-4">Revenue</th>
                <th className="p-4">Avg Rating</th>
              </tr>
            </thead>
            <tbody>
              {perCar.map((car) => (
                <tr key={car.vehicle_id} className="border-t border-zinc-100">
                  <td className="p-4 font-black">{car.title}</td>
                  <td className="p-4">{car.trips}</td>
                  <td className="p-4 font-bold">{money(car.net)}</td>
                  <td className="p-4">{car.avg_rating} ★</td>
                </tr>
              ))}
              {perCar.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-sm font-bold text-zinc-500 bg-white">
                    No vehicle statistics found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function hasSignal(rows, keys) {
  return rows.some((row) => keys.some((key) => Number(row?.[key] || 0) > 0))
}

function Chart({ title, empty, children }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 font-black">{title}</h2>
      {empty ? <div className="grid h-[270px] place-items-center rounded-md bg-zinc-50 text-sm font-black text-zinc-500">No data available</div> : children}
    </section>
  )
}
