import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Trash2 } from 'lucide-react'
import { deleteAdmin, formatDate, formatMoney, getAdmin, patchAdmin, postAdmin } from './adminApi'

const blank = {
  code: '',
  description: '',
  discount_type: 'percent',
  discount_value: 10,
  max_discount: 500,
  min_booking_amount: 1000,
  usage_limit: '',
  valid_from: new Date().toISOString().slice(0, 16),
  valid_until: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16),
  applicable_for: 'all',
  is_active: true,
}

export default function AdminCouponsPage() {
  const [rows, setRows] = useState([])
  const [editing, setEditing] = useState(null)
  const load = () => getAdmin('/coupons', { limit: 50 }).then((data) => setRows(data.items || []))
  useEffect(load, [])
  const remove = async (coupon) => {
    await deleteAdmin(`/coupons/${coupon.id}`)
    toast.success('Coupon deleted')
    load()
  }
  return <div className="space-y-5"><div className="flex items-center justify-between"><div><h2 className="text-2xl font-black">Coupons</h2><p className="text-sm font-bold text-zinc-500">Create and manage promotional codes.</p></div><button onClick={() => setEditing(blank)} className="inline-flex items-center gap-2 rounded-md bg-[#E31837] px-4 py-2 font-black text-white"><Plus size={18} /> Create Coupon</button></div><div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="p-4">Code</th><th className="p-4">Type</th><th className="p-4">Value</th><th className="p-4">Min Amount</th><th className="p-4">Usage</th><th className="p-4">Valid Until</th><th className="p-4">Status</th><th className="p-4">Actions</th></tr></thead><tbody>{rows.map((coupon) => <tr key={coupon.id} className="border-t border-zinc-100"><td className="p-4 font-black">{coupon.code}<p className="text-xs font-bold text-zinc-500">{coupon.description}</p></td><td className="p-4 capitalize">{coupon.discount_type}</td><td className="p-4">{coupon.discount_type === 'percent' ? `${coupon.discount_value}%` : formatMoney(coupon.discount_value)}</td><td className="p-4">{formatMoney(coupon.min_booking_amount)}</td><td className="p-4 font-bold">{coupon.used_count} / {coupon.usage_limit || '∞'} uses</td><td className="p-4">{formatDate(coupon.valid_until)}</td><td className="p-4"><span className={`rounded-full px-2 py-1 text-xs font-black ${coupon.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>{coupon.is_active ? 'Active' : 'Inactive'}</span></td><td className="p-4"><div className="flex gap-2"><button onClick={() => setEditing(couponToForm(coupon))} className="rounded-md border border-zinc-200 px-3 py-2 text-xs font-black">Edit</button><button title="Delete" onClick={() => remove(coupon)} className="rounded-md border border-zinc-200 p-2 text-[#E31837]"><Trash2 size={16} /></button></div></td></tr>)}</tbody></table></div>{editing && <CouponModal form={editing} onClose={() => setEditing(null)} onDone={load} />}</div>
}

function couponToForm(coupon) {
  return { ...coupon, valid_from: coupon.valid_from?.slice(0, 16), valid_until: coupon.valid_until?.slice(0, 16), usage_limit: coupon.usage_limit || '' }
}

function CouponModal({ form, onClose, onDone }) {
  const [value, setValue] = useState(form)
  const save = async () => {
    const body = { ...value, code: value.code.toUpperCase(), usage_limit: value.usage_limit ? Number(value.usage_limit) : null, valid_from: new Date(value.valid_from).toISOString(), valid_until: new Date(value.valid_until).toISOString() }
    if (value.id) await patchAdmin(`/coupons/${value.id}`, body)
    else await postAdmin('/coupons', body)
    toast.success('Coupon saved')
    onDone()
    onClose()
  }
  const set = (key, next) => setValue((current) => ({ ...current, [key]: next }))
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl"><h3 className="text-lg font-black">{value.id ? 'Edit' : 'Create'} Coupon</h3><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="label">Code<input className="input mt-1 uppercase" value={value.code} onChange={(event) => set('code', event.target.value.toUpperCase())} /></label><label className="label">Description<input className="input mt-1" value={value.description} onChange={(event) => set('description', event.target.value)} /></label><label className="label">Type<select className="input mt-1" value={value.discount_type} onChange={(event) => set('discount_type', event.target.value)}><option value="percent">Percent</option><option value="flat">Flat Off</option></select></label><label className="label">Value<input type="number" className="input mt-1" value={value.discount_value} onChange={(event) => set('discount_value', Number(event.target.value))} /></label>{value.discount_type === 'percent' && <label className="label">Max discount<input type="number" className="input mt-1" value={value.max_discount || ''} onChange={(event) => set('max_discount', Number(event.target.value))} /></label>}<label className="label">Min booking amount<input type="number" className="input mt-1" value={value.min_booking_amount} onChange={(event) => set('min_booking_amount', Number(event.target.value))} /></label><label className="label">Usage limit<input className="input mt-1" value={value.usage_limit} onChange={(event) => set('usage_limit', event.target.value)} placeholder="Unlimited" /></label><label className="label">Applicable for<select className="input mt-1" value={value.applicable_for} onChange={(event) => set('applicable_for', event.target.value)}><option value="all">All Users</option><option value="new_users">New Users Only</option></select></label><label className="label">Valid from<input type="datetime-local" className="input mt-1" value={value.valid_from} onChange={(event) => set('valid_from', event.target.value)} /></label><label className="label">Valid until<input type="datetime-local" className="input mt-1" value={value.valid_until} onChange={(event) => set('valid_until', event.target.value)} /></label><label className="flex items-center gap-2 font-black"><input type="checkbox" checked={value.is_active} onChange={(event) => set('is_active', event.target.checked)} /> Active</label></div><div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded-md border border-zinc-200 px-4 py-2 font-black">Cancel</button><button onClick={save} className="rounded-md bg-[#E31837] px-4 py-2 font-black text-white">Save Coupon</button></div></div></div>
}
