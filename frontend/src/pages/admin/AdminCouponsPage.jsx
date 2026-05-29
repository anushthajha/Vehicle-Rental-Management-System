import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Trash2 } from 'lucide-react'
import { deleteAdmin, formatDate, formatMoney, getAdmin, patchAdmin, postAdmin } from './adminApi'

const blank = {
  code: '',
  description: '',
  discount_type: 'percent',
  discount_value: 5,
  max_discount: 150,
  min_booking_amount: 1000,
  usage_limit: '',
  valid_from: new Date().toISOString().slice(0, 16),
  valid_until: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16),
  applicable_for: 'all',
  is_active: true,
}

function couponToForm(coupon) {
  return {
    ...coupon,
    valid_from: coupon.valid_from?.slice(0, 16),
    valid_until: coupon.valid_until?.slice(0, 16),
    usage_limit: coupon.usage_limit || '',
  }
}

// Defined outside CouponModal so it never gets re-created on each render
// (defining it inside would cause inputs to lose focus after every keystroke)
function Field({ label, error, children }) {
  return (
    <label className="label block">
      {label}
      {children}
      {error && <span className="mt-1 block text-xs font-bold text-red-600">{error}</span>}
    </label>
  )
}

export default function AdminCouponsPage() {
  const [rows, setRows] = useState([])
  const [editing, setEditing] = useState(null)

  function load() {
    getAdmin('/coupons', { limit: 50 })
      .then((data) => setRows(data?.items || []))
      .catch(() => setRows([]))
  }

  useEffect(() => { load() }, [])

  const remove = async (coupon) => {
    if (!window.confirm(`Delete coupon ${coupon.code}? This cannot be undone.`)) return
    try {
      await deleteAdmin(`/coupons/${coupon.id}`)
      toast.success('Coupon deleted')
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to delete coupon')
    }
  }

  const toggle = async (coupon) => {
    try {
      const body = {
        ...couponToForm(coupon),
        is_active: !coupon.is_active,
        valid_from: new Date(coupon.valid_from || Date.now()).toISOString(),
        valid_until: new Date(coupon.valid_until || Date.now()).toISOString(),
        usage_limit: coupon.usage_limit || null,
      }
      await patchAdmin(`/coupons/${coupon.id}`, body)
      toast.success(`Coupon ${coupon.is_active ? 'deactivated' : 'activated'}`)
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to toggle coupon')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black">Coupons</h2>
          <p className="text-sm font-bold text-zinc-500">Create and manage promotional codes.</p>
        </div>
        <button onClick={() => setEditing(blank)} className="inline-flex items-center gap-2 rounded-md bg-[#E31837] px-4 py-2 font-black text-white">
          <Plus size={18} /> Create Coupon
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="p-4">Code</th>
              <th className="p-4">Type</th>
              <th className="p-4">Value</th>
              <th className="p-4">Min Amount</th>
              <th className="p-4">Usage</th>
              <th className="p-4">Valid Until</th>
              <th className="p-4">Status</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((coupon) => (
              <tr key={coupon?.id} className="border-t border-zinc-100">
                <td className="p-4 font-black">
                  {coupon?.code || '-'}
                  <p className="text-xs font-bold text-zinc-500">{coupon?.description || ''}</p>
                </td>
                <td className="p-4 capitalize">{coupon?.discount_type || '-'}</td>
                <td className="p-4">
                  {coupon?.discount_type === 'percent' ? `${coupon?.discount_value || 0}%` : formatMoney(coupon?.discount_value)}
                </td>
                <td className="p-4">{formatMoney(coupon?.min_booking_amount)}</td>
                <td className="p-4 font-bold">{coupon?.used_count || 0} / {coupon?.usage_limit || '∞'} uses</td>
                <td className="p-4">{formatDate(coupon?.valid_until)}</td>
                <td className="p-4">
                  <span className={`rounded-full px-2 py-1 text-xs font-black ${coupon?.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>
                    {coupon?.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggle(coupon)}
                      className={`rounded-md border px-3 py-2 text-xs font-black ${coupon?.is_active ? 'border-amber-200 text-amber-700 hover:bg-amber-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}
                    >
                      {coupon?.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => setEditing(couponToForm(coupon))} className="rounded-md border border-zinc-200 px-3 py-2 text-xs font-black">
                      Edit
                    </button>
                    <button title="Delete" onClick={() => remove(coupon)} className="rounded-md border border-zinc-200 p-2 text-[#E31837]">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <CouponModal form={editing} onClose={() => setEditing(null)} onDone={load} />}
    </div>
  )
}

function CouponModal({ form, onClose, onDone }) {
  const [value, setValue] = useState(form)
  const [errors, setErrors] = useState({})

  const set = (key, next) => {
    setValue((current) => ({ ...current, [key]: next }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const save = async () => {
    const newErrors = {}
    const code = value.code.trim().toUpperCase()
    if (!code || !/^[A-Z0-9]{4,12}$/.test(code)) {
      newErrors.code = 'Code must be 4-12 uppercase letters/numbers'
    }
    if (!value.description?.trim()) {
      newErrors.description = 'Description is required'
    }
    if (value.discount_type === 'percent' && Number(value.discount_value) > 5) {
      newErrors.discount_value = 'Maximum discount allowed is 5%'
    }
    if (!value.discount_value || Number(value.discount_value) <= 0) {
      newErrors.discount_value = newErrors.discount_value || 'Enter a valid discount value'
    }
    if (!value.min_booking_amount || Number(value.min_booking_amount) < 0) {
      newErrors.min_booking_amount = 'Enter a valid minimum booking amount'
    }
    if (!value.valid_until || new Date(value.valid_until) <= new Date()) {
      newErrors.valid_until = 'Valid until must be a future date'
    }
    if (Object.keys(newErrors).length) {
      setErrors(newErrors)
      toast.error('Please fix the errors before saving.')
      return
    }
    setErrors({})
    try {
      const body = {
        ...value,
        code,
        usage_limit: value.usage_limit ? Number(value.usage_limit) : null,
        valid_from: new Date(value.valid_from).toISOString(),
        valid_until: new Date(value.valid_until).toISOString(),
      }
      if (value.id) await patchAdmin(`/coupons/${value.id}`, body)
      else await postAdmin('/coupons', body)
      toast.success('Coupon saved')
      onDone()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to save coupon')
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <h3 className="text-lg font-black">{value.id ? 'Edit' : 'Create'} Coupon</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Code" error={errors.code}>
            <input
              className={`input mt-1 uppercase ${errors.code ? 'border-red-500' : ''}`}
              value={value.code}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
              placeholder="e.g. FLEET5"
            />
          </Field>
          <Field label="Description" error={errors.description}>
            <input
              className={`input mt-1 ${errors.description ? 'border-red-500' : ''}`}
              value={value.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>
          <Field label="Type">
            <select className="input mt-1" value={value.discount_type} onChange={(e) => set('discount_type', e.target.value)}>
              <option value="percent">Percent (max 5%)</option>
              <option value="flat">Flat Off (₹)</option>
            </select>
          </Field>
          <Field label={`Value${value.discount_type === 'percent' ? ' (max 5%)' : ' (₹)'}`} error={errors.discount_value}>
            <input
              type="number"
              min="0"
              max={value.discount_type === 'percent' ? 5 : undefined}
              step="0.01"
              className={`input mt-1 ${errors.discount_value ? 'border-red-500' : ''}`}
              value={value.discount_value}
              onChange={(e) => set('discount_value', Number(e.target.value))}
            />
          </Field>
          {value.discount_type === 'percent' && (
            <Field label="Max discount (₹)">
              <input
                type="number"
                className="input mt-1"
                value={value.max_discount || ''}
                onChange={(e) => set('max_discount', Number(e.target.value))}
              />
            </Field>
          )}
          <Field label="Min booking amount (₹)" error={errors.min_booking_amount}>
            <input
              type="number"
              className={`input mt-1 ${errors.min_booking_amount ? 'border-red-500' : ''}`}
              value={value.min_booking_amount}
              onChange={(e) => set('min_booking_amount', Number(e.target.value))}
            />
          </Field>
          <Field label="Usage limit per user">
            <input
              className="input mt-1"
              value={value.usage_limit}
              onChange={(e) => set('usage_limit', e.target.value)}
              placeholder="Unlimited"
            />
          </Field>
          <Field label="Applicable for">
            <select className="input mt-1" value={value.applicable_for} onChange={(e) => set('applicable_for', e.target.value)}>
              <option value="all">All Users</option>
              <option value="new_users">New Users Only</option>
            </select>
          </Field>
          <Field label="Valid from">
            <input
              type="datetime-local"
              className="input mt-1"
              value={value.valid_from}
              onChange={(e) => set('valid_from', e.target.value)}
            />
          </Field>
          <Field label="Valid until *" error={errors.valid_until}>
            <input
              type="datetime-local"
              className={`input mt-1 ${errors.valid_until ? 'border-red-500' : ''}`}
              value={value.valid_until}
              onChange={(e) => set('valid_until', e.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 font-black">
            <input type="checkbox" checked={value.is_active} onChange={(e) => set('is_active', e.target.checked)} />
            Active
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-zinc-200 px-4 py-2 font-black">Cancel</button>
          <button onClick={save} className="rounded-md bg-[#E31837] px-4 py-2 font-black text-white">Save Coupon</button>
        </div>
      </div>
    </div>
  )
}
