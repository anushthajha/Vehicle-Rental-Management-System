import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, Car as Vehicle, Headphones, IdCard, IndianRupee, Users, WalletCards } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoney, getAdmin, initials } from './adminApi'

const colors = ['#E31837', '#111827', '#16A34A', '#F59E0B', '#2563EB']

function StatCard({ title, value, subtitle, icon: Icon, trend = 'up' }) {
  const Trend = trend === 'down' ? ArrowDownRight : ArrowUpRight
  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-zinc-500">{title}</p>
          <div className="mt-2 text-3xl font-black text-zinc-950">{value}</div>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-md bg-red-50 text-[#E31837]">
          <Icon size={22} />
        </div>
      </div>
      <div className={`mt-4 flex items-center gap-1 text-sm font-bold ${trend === 'down' ? 'text-red-600' : 'text-emerald-600'}`}>
        <Trend size={16} />
        <span>{subtitle}</span>
      </div>
    </article>
  )
}

function ChartCard({ title, children }) {
  return (
    <section className="h-80 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-black text-zinc-950">{title}</h2>
      {children}
    </section>
  )
}

export default function AdminDashboardPage() {
  const [data, setData] = useState(null)
  const [daily, setDaily] = useState([])
  const [revenue, setRevenue] = useState([])
  const [users, setUsers] = useState([])
  const [feed, setFeed] = useState([])

  useEffect(() => {
    Promise.all([
      getAdmin('/stats/overview'),
      getAdmin('/analytics/daily-bookings'),
      getAdmin('/analytics/revenue', { year: new Date().getFullYear() }),
      getAdmin('/analytics/new-users'),
      getAdmin('/analytics/activity-feed', { limit: 10 }),
    ]).then(([overview, dailyRows, revenueRows, userRows, feedRows]) => {
      setData(overview)
      setDaily(dailyRows)
      setRevenue(revenueRows)
      setUsers(userRows)
      setFeed(feedRows.items || [])
    })
  }, [])

  if (!data) {
    return <div className="grid min-h-[60vh] place-items-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-[#E31837]" /></div>
  }

  const statusData = Object.entries(data.bookings.status_distribution || {}).map(([name, value]) => ({ name, value }))
  const totalPlatformFees = revenue.reduce((sum, row) => sum + Number(row.platform_fee || 0), 0)
  const totalManagerPayouts = revenue.reduce((sum, row) => sum + Number(row.manager_payouts || 0), 0)
  const totalRefunds = revenue.reduce((sum, row) => sum + Number(row.refunds || 0), 0)
  const revenueBreakdown = [
    { name: 'Platform fees', value: totalPlatformFees },
    { name: 'Manager payouts', value: totalManagerPayouts },
    { name: 'Refunds issued', value: totalRefunds },
  ].filter((item) => item.value > 0)

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Users" value={data.users.total} subtitle={`${data.users.new_this_week} new this week`} icon={Users} />
        <StatCard title="Total Cars" value={data.vehicles.total} subtitle={`${data.vehicles.approved} approved`} icon={Vehicle} />
        <StatCard title="Revenue This Month" value={formatMoney(data.revenue.this_month)} subtitle={`${formatMoney(data.revenue.this_week)} this week`} icon={IndianRupee} />
        <StatCard title="Active Bookings Now" value={data.bookings.active_now} subtitle={`${data.bookings.this_month} this month`} icon={WalletCards} />
        <StatCard title="Pending KYC" value={data.pending.kyc_count} subtitle="Needs review" icon={IdCard} trend={data.pending.kyc_count ? 'up' : 'down'} />
        <StatCard title="Open Tickets" value={data.pending.support_tickets_count} subtitle="Support queue" icon={Headphones} trend={data.pending.support_tickets_count ? 'up' : 'down'} />
        <StatCard title="Pending Vehicle Approvals" value={data.pending.car_approval_count} subtitle="Manager listings" icon={Vehicle} trend={data.pending.car_approval_count ? 'up' : 'down'} />
        <StatCard title="Payout Requests" value={data.pending.payout_requests_count} subtitle="Manager payouts" icon={IndianRupee} trend={data.pending.payout_requests_count ? 'up' : 'down'} />
      </section>

      <section className="grid gap-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm xl:grid-cols-[1fr_1.1fr_0.9fr]">
        <div>
          <p className="text-sm font-black uppercase text-[#E31837]">Revenue Statistics</p>
          <h2 className="mt-1 text-2xl font-black">Platform revenue</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Metric label="Total platform revenue" value={formatMoney(data.revenue.total || totalPlatformFees)} />
            <Metric label="This month's revenue" value={formatMoney(data.revenue.this_month)} />
            <Metric label="Platform fee collected" value={formatMoney(totalPlatformFees)} />
            <Metric label="Manager payouts" value={formatMoney(totalManagerPayouts)} />
          </div>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={revenue}><Tooltip /><Line type="monotone" dataKey="platform_fee" stroke="#E31837" strokeWidth={3} dot={false} /><Line type="monotone" dataKey="manager_payouts" stroke="#111827" strokeWidth={2} dot={false} /></LineChart>
          </ResponsiveContainer>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart><Pie data={revenueBreakdown.length ? revenueBreakdown : [{ name: 'No revenue', value: 1 }]} dataKey="value" innerRadius={52} outerRadius={82}>{(revenueBreakdown.length ? revenueBreakdown : [{ name: 'No revenue' }]).map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip /></PieChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Daily Bookings">
          <ResponsiveContainer width="100%" height="85%">
            <LineChart data={daily}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" hide /><YAxis allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="count" stroke="#E31837" strokeWidth={3} dot={false} /></LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Monthly Revenue">
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={revenue}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Bar dataKey="platform_fee" stackId="a" fill="#E31837" /><Bar dataKey="manager_payouts" stackId="a" fill="#111827" /></BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Booking Status">
          <ResponsiveContainer width="100%" height="85%">
            <PieChart><Pie data={statusData} dataKey="value" innerRadius={60} outerRadius={95} paddingAngle={3}>{statusData.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip /></PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="New Users">
          <ResponsiveContainer width="100%" height="85%">
            <AreaChart data={users}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip /><Area type="monotone" dataKey="users" fill="#FEE2E2" stroke="#E31837" strokeWidth={3} /></AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1.4fr]">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-black">Pending Actions</h2>
          <div className="mt-4 grid gap-3">
            <Link className="rounded-md border border-zinc-200 p-4 font-black hover:border-[#E31837]" to="/admin/kyc">KYC Queue: {data.pending.kyc_count}</Link>
            <Link className="rounded-md border border-zinc-200 p-4 font-black hover:border-[#E31837]" to="/admin/vehicles">Vehicle Approvals: {data.pending.car_approval_count}</Link>
            <Link className="rounded-md border border-zinc-200 p-4 font-black hover:border-[#E31837]" to="/admin/support">Support Tickets: {data.pending.support_tickets_count}</Link>
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-black">Activity Feed</h2>
          <div className="mt-4 space-y-3">
            {feed.map((item) => (
              <div key={item._id} className="flex gap-3 border-b border-zinc-100 pb-3 last:border-0">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-zinc-900 text-xs font-black text-white">{initials(item.payload?.actor_name || item.actor_id)}</div>
                <div>
                  <p className="font-bold text-zinc-900">{item.action?.replaceAll('_', ' ')} <span className="text-zinc-500">on {item.entity_type}</span></p>
                  <p className="text-sm text-zinc-500">{new Date(item.created_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
            {!feed.length && <p className="text-sm font-bold text-zinc-500">No activity yet.</p>}
          </div>
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value }) {
  return <div className="rounded-md bg-zinc-50 p-4"><p className="text-xs font-black uppercase text-zinc-500">{label}</p><p className="mt-1 text-xl font-black text-zinc-950">{value}</p></div>
}
