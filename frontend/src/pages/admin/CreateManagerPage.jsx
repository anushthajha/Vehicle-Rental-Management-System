import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { postAdmin } from './adminApi'

export default function CreateManagerPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '' })
  const save = async () => {
    await postAdmin('/users/managers', form).catch(() => postAdmin('/managers', form))
    toast.success('Vehicle Manager created')
    navigate('/admin/users/managers')
  }
  return <main className="mx-auto max-w-2xl space-y-5"><div><h1 className="text-2xl font-black">Create Vehicle Manager</h1><p className="text-sm font-bold text-zinc-500">Admin-created manager accounts can add vehicles and manage bookings.</p></div><section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"><div className="grid gap-4"><label className="label">Full name<input className="input mt-1" value={form.full_name} onChange={(event) => setForm((value) => ({ ...value, full_name: event.target.value }))} /></label><label className="label">Email<input className="input mt-1" type="email" value={form.email} onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))} /></label><label className="label">Phone<input className="input mt-1" value={form.phone} onChange={(event) => setForm((value) => ({ ...value, phone: event.target.value }))} /></label><label className="label">Temporary password<input className="input mt-1" type="password" value={form.password} onChange={(event) => setForm((value) => ({ ...value, password: event.target.value }))} /></label></div><div className="mt-6 flex justify-end gap-2"><button onClick={() => navigate('/admin/users/managers')} className="rounded-md border border-zinc-200 px-4 py-2 font-black">Cancel</button><button onClick={save} className="rounded-md bg-[#E31837] px-4 py-2 font-black text-white">Create Vehicle Manager</button></div></section></main>
}
