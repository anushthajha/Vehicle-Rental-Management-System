import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { formatDate, formatMoney, getAdmin, patchAdmin, postAdmin } from './adminApi'

function StatusBadge({ value }) {
  const green = ['paid', 'completed', 'confirmed', 'active', 'processing', 'resolved'].includes(value)
  const red = ['failed', 'refunded', 'cancelled', 'rejected'].includes(value)
  return <span className={`rounded-full px-2 py-1 text-xs font-black capitalize ${green ? 'bg-emerald-50 text-emerald-700' : red ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{value?.replaceAll('_', ' ')}</span>
}

export function AdminBookingsPage() {
  const [rows, setRows] = useState([])
  useEffect(() => { getAdmin('/bookings', { limit: 50 }).then((data) => setRows(data.items || [])) }, [])
  return <DataShell title="Bookings" subtitle="Trip operations across guests, managers, cities, and dates."><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="p-4">Ref</th><th className="p-4">Car</th><th className="p-4">Guest</th><th className="p-4">City</th><th className="p-4">Pickup</th><th className="p-4">Return</th><th className="p-4">Amount</th><th className="p-4">Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-zinc-100"><td className="p-4 font-black">{row.booking_ref}</td><td className="p-4">{row.car_title}</td><td className="p-4">{row.guest_name}</td><td className="p-4">{row.city}</td><td className="p-4">{formatDate(row.pickup_datetime)}</td><td className="p-4">{formatDate(row.return_datetime)}</td><td className="p-4 font-black">{formatMoney(row.total_amount)}</td><td className="p-4"><StatusBadge value={row.status} /></td></tr>)}</tbody></table></DataShell>
}

export function AdminPaymentsPage() {
  const [rows, setRows] = useState([])
  const [refund, setRefund] = useState(null)
  const load = () => getAdmin('/payments', { limit: 50 }).then((data) => setRows(data.items || []))
  useEffect(load, [])
  return <DataShell title="Payments" subtitle="Payment status, simulated transaction records, and manual wallet refunds."><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="p-4">Booking</th><th className="p-4">User</th><th className="p-4">Amount</th><th className="p-4">Method</th><th className="p-4">Created</th><th className="p-4">Status</th><th className="p-4">Actions</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-zinc-100"><td className="p-4 font-black">{row.booking_ref}</td><td className="p-4">{row.user_name}</td><td className="p-4 font-black">{formatMoney(row.amount)}</td><td className="p-4 capitalize">{row.method}</td><td className="p-4">{formatDate(row.created_at)}</td><td className="p-4"><StatusBadge value={row.status} /></td><td className="p-4"><button onClick={() => setRefund(row)} className="rounded-md border border-zinc-200 px-3 py-2 text-xs font-black">Manual Refund</button></td></tr>)}</tbody></table>{refund && <RefundModal payment={refund} onClose={() => setRefund(null)} onDone={load} />}</DataShell>
}

export function AdminPayoutsPage() {
  const [rows, setRows] = useState([])
  const load = () => getAdmin('/payouts', { limit: 50 }).then((data) => setRows(data.items || []))
  useEffect(load, [])
  const action = async (row, name) => {
    await patchAdmin(`/payouts/${row.id}/${name}`)
    toast.success('Payout updated')
    load()
  }
  return <DataShell title="Payouts" subtitle="Process manager payout requests and mark paid or failed."><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="p-4">Manager</th><th className="p-4">Amount</th><th className="p-4">Requested</th><th className="p-4">Processed</th><th className="p-4">Status</th><th className="p-4">Actions</th></tr></thead><tbody>{rows.map((row) => { const manager = row.manager || row.vehicle_manager || {}; return <tr key={row.id} className="border-t border-zinc-100"><td className="p-4 font-black">{manager.name || 'Manager'}<p className="text-xs font-bold text-zinc-500">{manager.email || '-'}</p></td><td className="p-4 font-black">{formatMoney(row.amount)}</td><td className="p-4">{formatDate(row.requested_at)}</td><td className="p-4">{formatDate(row.processed_at)}</td><td className="p-4"><StatusBadge value={row.status} /></td><td className="p-4"><div className="flex gap-2"><button onClick={() => action(row, 'process')} className="rounded-md border border-zinc-200 px-3 py-2 text-xs font-black">Process</button><button onClick={() => action(row, 'complete')} className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-black text-white">Complete</button><button onClick={() => action(row, 'fail')} className="rounded-md bg-[#E31837] px-3 py-2 text-xs font-black text-white">Fail</button></div></td></tr> })}</tbody></table></DataShell>
}

export function AdminSettingsPage() {
  return <DataShell title="Settings" subtitle="Admin-only configuration area."><div className="grid gap-4 md:grid-cols-3"><div className="rounded-lg border border-zinc-200 p-5"><h3 className="font-black">Access</h3><p className="mt-2 text-sm font-bold text-zinc-500">All admin API routes require role='admin'.</p></div><div className="rounded-lg border border-zinc-200 p-5"><h3 className="font-black">Branding</h3><p className="mt-2 text-sm font-bold text-zinc-500">Sidebar #1F2937, accent #E31837.</p></div><div className="rounded-lg border border-zinc-200 p-5"><h3 className="font-black">Queues</h3><p className="mt-2 text-sm font-bold text-zinc-500">KYC, support, cars, and payouts are tracked in the dashboard.</p></div></div></DataShell>
}

function DataShell({ title, subtitle, children }) {
  return <div className="space-y-5"><div><h2 className="text-2xl font-black">{title}</h2><p className="text-sm font-bold text-zinc-500">{subtitle}</p></div><div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">{children}</div></div>
}

function RefundModal({ payment, onClose, onDone }) {
  const [amount, setAmount] = useState(payment.amount)
  const [reason, setReason] = useState('')
  const save = async () => {
    await postAdmin(`/payments/${payment.id}/manual-refund`, { amount: Number(amount), reason })
    toast.success('Refund credited to wallet')
    onDone()
    onClose()
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"><h3 className="text-lg font-black">Manual Refund</h3><label className="label mt-4 block">Amount<input type="number" className="input mt-1" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label className="label mt-4 block">Reason<textarea className="input mt-1 min-h-24" value={reason} onChange={(event) => setReason(event.target.value)} /></label><div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded-md border border-zinc-200 px-4 py-2 font-black">Cancel</button><button onClick={save} disabled={reason.length < 3} className="rounded-md bg-[#E31837] px-4 py-2 font-black text-white disabled:opacity-50">Refund</button></div></div></div>
}
