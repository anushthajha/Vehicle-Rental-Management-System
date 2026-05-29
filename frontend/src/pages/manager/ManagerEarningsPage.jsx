import React, { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download } from 'lucide-react'
import { dateLabel, downloadCsv, getManager, money } from './managerApi'

export default function ManagerEarningsPage() {
  const [summary, setSummary] = useState(null)
  const [monthly, setMonthly] = useState([])
  const [vehicles, setCars] = useState([])
  const [transactions, setTransactions] = useState([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [sort, setSort] = useState('net')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    Promise.all([
      getManager('/earnings/summary').catch(() => null),
      getManager('/earnings/monthly', { year }).catch(() => []),
      getManager('/earnings/per-car').catch(() => []),
      getManager('/earnings/transactions', { limit: 100 }).catch(() => ({ items: [] })),
    ]).then(([s, m, c, t]) => {
      setSummary(s || { total_earned_all_time: 0, total_earned_this_month: 0, total_earned_last_month: 0, average_earnings_per_trip: 0, total_trips_completed: 0 })
      setMonthly(m || [])
      setCars(c || [])
      setTransactions(t?.items || [])
    })
  }, [year])

  const sortedCars = useMemo(() => vehicles.slice().sort((a, b) => Number(b[sort] || 0) - Number(a[sort] || 0)), [vehicles, sort])
  const filteredTxns = useMemo(() => {
    if (filter === 'this_month') {
      const now = new Date()
      return transactions.filter((txn) => {
        const date = new Date(txn.date)
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
      })
    }
    return transactions
  }, [transactions, filter])

  if (!summary) return <div className="grid min-h-screen place-items-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-sigfleet" /></div>

  const exportReport = () => downloadCsv('manager-earnings.csv', [
    ['Date', 'Description', 'Rental ID', 'Amount', 'Type'],
    ...filteredTxns.map((txn) => [dateLabel(txn.date), txn.description, txn.booking_ref || '', txn.amount, txn.type]),
  ])

  return <div className="px-4 py-8"><section className="mx-auto max-w-7xl space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-black uppercase text-sigfleet">Manager Earnings</p><h1 className="text-3xl font-black">Revenue and transactions</h1></div><button onClick={exportReport} className="inline-flex items-center gap-2 rounded-md bg-zinc-950 px-4 py-3 font-black text-white"><Download size={18} /> Download CSV</button></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Stat label="All-Time Earnings" value={money(summary.total_earned_all_time)} /><Stat label="This Month" value={money(summary.total_earned_this_month)} /><Stat label="Last Month" value={money(summary.total_earned_last_month)} /><Stat label="Avg per Trip" value={money(summary.average_earnings_per_trip)} /><Stat label="Total Trips" value={summary.total_trips_completed} /></div>
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><h2 className="font-black">Monthly Trend</h2><select className="input w-32" value={year} onChange={(event) => setYear(Number(event.target.value))}>{[0, 1, 2].map((back) => <option key={back} value={new Date().getFullYear() - back}>{new Date().getFullYear() - back}</option>)}</select></div><ResponsiveContainer width="100%" height={300}><AreaChart data={monthly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Area type="monotone" dataKey="platform_fees" stackId="1" stroke="#111827" fill="#111827" /><Area type="monotone" dataKey="net" stackId="1" stroke="#E31837" fill="#FEE2E2" /></AreaChart></ResponsiveContainer></section>
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm"><div className="flex items-center justify-between p-5"><h2 className="font-black">Per-Vehicle Earnings</h2><select className="input w-44" value={sort} onChange={(event) => setSort(event.target.value)}><option value="net">Net Earnings</option><option value="trips">Trips</option><option value="gross">Gross</option><option value="platform_fees">Platform Fee</option><option value="avg_rating">Rating</option></select></div><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="p-4">Vehicle</th><th className="p-4">Trips</th><th className="p-4">Gross</th><th className="p-4">Platform Fee</th><th className="p-4">Net</th><th className="p-4">Avg Rating</th></tr></thead><tbody>{sortedCars.map((car) => <tr key={car.vehicle_id} className="border-t border-zinc-100"><td className="p-4"><div className="flex items-center gap-3"><img alt="" src={car.primary_image || '/vite.svg'} className="h-12 w-16 rounded object-cover" /><span className="font-black">{car.title}</span></div></td><td className="p-4">{car.trips}</td><td className="p-4">{money(car.gross)}</td><td className="p-4">{money(car.platform_fees)}</td><td className="p-4 font-black">{money(car.net)}</td><td className="p-4">{car.avg_rating} ★</td></tr>)}</tbody></table></section>
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm"><div className="flex items-center justify-between p-5"><h2 className="font-black">Transaction History</h2><select className="input w-44" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All</option><option value="this_month">This Month</option></select></div><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="p-4">Date</th><th className="p-4">Description</th><th className="p-4">Rental ID</th><th className="p-4">Amount</th><th className="p-4">Type</th></tr></thead><tbody>{filteredTxns.map((txn) => <tr key={txn.id} className="border-t border-zinc-100"><td className="p-4">{dateLabel(txn.date)}</td><td className="p-4">{txn.description}</td><td className="p-4 font-bold">{txn.booking_ref || '-'}</td><td className="p-4 font-black text-emerald-700">{money(txn.amount)}</td><td className="p-4 capitalize">{txn.type}</td></tr>)}</tbody></table></section>
  </section></div>
}

function Stat({ label, value }) {
  return <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-zinc-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>
}
