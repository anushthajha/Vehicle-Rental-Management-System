import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { postAdmin } from './adminApi'

function validate(form) {
  const errors = {}
  if (!form.full_name.trim() || form.full_name.trim().length < 2) errors.full_name = 'Name must be at least 2 characters'
  if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Enter a valid email address'
  if (!form.phone || !/^[6-9]\d{9}$/.test(form.phone)) errors.phone = 'Enter a valid 10-digit Indian mobile number'
  if (!form.password || form.password.length < 8) errors.password = 'Password must be at least 8 characters'
  return errors
}

export default function CreateManagerPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '' })
  const [errors, setErrors] = useState({})

  const set = (key, value) => {
    setForm((c) => ({ ...c, [key]: value }))
    if (errors[key]) setErrors((c) => ({ ...c, [key]: undefined }))
  }

  const save = async () => {
    const fieldErrors = validate(form)
    if (Object.keys(fieldErrors).length) { setErrors(fieldErrors); return }
    try {
      await postAdmin('/vehicle-managers/create', form)
      toast.success('Vehicle Manager created')
      navigate('/admin/users/managers')
    } catch (err) {
      toast.error(err.message || 'Failed to create manager')
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-black">Create Vehicle Manager</h1>
        <p className="text-sm font-bold text-zinc-500">Admin-created manager accounts can add vehicles and manage bookings.</p>
      </div>
      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4">
          <div>
            <label className="label">Full name <span className="text-red-500">*</span></label>
            <input
              className={`input mt-1 ${errors.full_name ? 'border-red-500 bg-red-50' : ''}`}
              value={form.full_name}
              onChange={(e) => set('full_name', e.target.value)}
              placeholder="e.g. Ravi Kumar"
            />
            {errors.full_name && <p className="mt-1 text-xs font-bold text-red-600">{errors.full_name}</p>}
          </div>
          <div>
            <label className="label">Email <span className="text-red-500">*</span></label>
            <input
              className={`input mt-1 ${errors.email ? 'border-red-500 bg-red-50' : ''}`}
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="manager@example.com"
            />
            {errors.email && <p className="mt-1 text-xs font-bold text-red-600">{errors.email}</p>}
          </div>
          <div>
            <label className="label">Phone <span className="text-red-500">*</span></label>
            <div className="mt-1 flex">
              <span className="grid h-11 place-items-center rounded-l-md border border-r-0 border-zinc-300 bg-zinc-100 px-3 font-bold text-zinc-500 select-none">+91</span>
              <input
                className={`input h-11 rounded-l-none ${errors.phone ? 'border-red-500 bg-red-50' : ''}`}
                inputMode="numeric"
                value={form.phone}
                maxLength={10}
                onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="9876543210"
              />
            </div>
            {errors.phone
              ? <p className="mt-1 text-xs font-bold text-red-600">{errors.phone}</p>
              : <p className="mt-1 text-xs text-zinc-400">10-digit number without +91</p>
            }
          </div>
          <div>
            <label className="label">Temporary password <span className="text-red-500">*</span></label>
            <input
              className={`input mt-1 ${errors.password ? 'border-red-500 bg-red-50' : ''}`}
              type="password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              placeholder="Min 8 characters"
            />
            {errors.password && <p className="mt-1 text-xs font-bold text-red-600">{errors.password}</p>}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => navigate('/admin/users/managers')} className="rounded-md border border-zinc-200 px-4 py-2 font-black">Cancel</button>
          <button onClick={save} className="rounded-md bg-[#E31837] px-4 py-2 font-black text-white">Create Vehicle Manager</button>
        </div>
      </section>
    </main>
  )
}
