import React, { useState } from 'react'
import api from '../services/api'
import { PageHero, PublicShell, Section } from './static/StaticShell'

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', category: 'booking', message: '' })
  const [done, setDone] = useState(false)
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const submit = async (event) => {
    event.preventDefault()
    await api.post('/support/contact', form)
    setDone(true)
  }
  return <PublicShell><PageHero eyebrow="Contact" title="We are here to help" subtitle="Send a question, issue, or partnership note and the support team will respond." /><Section title="Contact support"><div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">{done ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-lg font-black text-emerald-800">Thank you! We'll respond within 24 hours.</div> : <form onSubmit={submit} className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"><input className="input" placeholder="Name" value={form.name} onChange={(e) => set('name', e.target.value)} required /><input className="input" type="email" placeholder="Email" value={form.email} onChange={(e) => set('email', e.target.value)} required /><input className="input" placeholder="Phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} /><select className="input" value={form.category} onChange={(e) => set('category', e.target.value)}><option value="booking">Booking</option><option value="payment">Payment</option><option value="car_issue">Car issue</option><option value="account">Account</option><option value="other">Other</option></select><textarea className="input min-h-40" placeholder="Message" value={form.message} onChange={(e) => set('message', e.target.value)} required /><button className="rounded-md bg-[#E31837] px-5 py-3 font-black text-white">Submit</button></form>}<div className="rounded-lg bg-white p-6 shadow-sm"><h3 className="font-display text-2xl font-black">Contact info</h3><p className="mt-4 font-bold text-zinc-600">support@sigfleet.com</p><p className="mt-2 font-bold text-zinc-600">+91-80-XXXX-XXXX</p></div></div></Section></PublicShell>
}
