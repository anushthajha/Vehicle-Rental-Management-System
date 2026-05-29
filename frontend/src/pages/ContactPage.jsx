import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuthStore } from '../context/AuthContext'
import { PageHero, PublicShell, Section } from './static/StaticShell'

const CATEGORIES = [
  ['booking', 'Booking'],
  ['payment', 'Payment'],
  ['car_issue', 'Vehicle issue'],
  ['account', 'Account'],
  ['other', 'Other'],
]

function validate(form) {
  const errors = {}
  if (!form.name?.trim() || form.name.trim().length < 2) errors.name = 'Name must be at least 2 characters'
  if (!form.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Enter a valid email address'
  if (form.phone && !/^[6-9]\d{9}$/.test(form.phone.replace(/\D/g, ''))) errors.phone = 'Enter a valid 10-digit Indian mobile number'
  if (!form.message?.trim() || form.message.trim().length < 20) errors.message = 'Message must be at least 20 characters'
  return errors
}

export default function ContactPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: user?.full_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    category: 'booking',
    message: '',
  })
  const [errors, setErrors] = useState({})
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Redirect unauthenticated users to login, then back here
  if (!user) {
    return (
      <PublicShell>
        <PageHero eyebrow="Contact" title="We are here to help" subtitle="Please log in to raise a support ticket." />
        <Section title="Login required">
          <div className="max-w-md rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
            <p className="font-bold text-zinc-600 mb-6">You need to be logged in to raise a support ticket. We'll bring you right back here after login.</p>
            <button
              onClick={() => navigate('/auth/login', { state: { from: '/contact' } })}
              className="rounded-md bg-[#E31837] px-6 py-3 font-black text-white"
            >
              Login to Continue
            </button>
            <p className="mt-4 text-sm text-zinc-500">
              Don't have an account?{' '}
              <button onClick={() => navigate('/auth/register', { state: { from: '/contact' } })} className="font-bold text-[#E31837] underline">
                Register
              </button>
            </p>
          </div>
        </Section>
      </PublicShell>
    )
  }

  const set = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const submit = async (event) => {
    event.preventDefault()
    const fieldErrors = validate(form)
    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors)
      toast.error('Please fix the errors below before submitting.')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/support/contact', {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        category: form.category,
        message: form.message.trim(),
      })
      toast.success("Support ticket submitted! We'll get back to you within 24 hours.")
      setDone(true)
      setForm({ name: '', email: '', phone: '', category: 'booking', message: '' })
      setErrors({})
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Failed to submit. Please try again.'
      toast.error(typeof msg === 'string' ? msg : 'Failed to submit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PublicShell>
      <PageHero eyebrow="Contact" title="We are here to help" subtitle="Send a question, issue, or partnership note and the support team will respond." />
      <Section title="Contact support">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          {done ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-lg font-black text-emerald-800">
              ✓ Thank you! We'll respond within 24 hours.
              <button onClick={() => setDone(false)} className="mt-4 block text-sm font-bold text-emerald-700 underline">Submit another request</button>
            </div>
          ) : (
            <form onSubmit={submit} className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
              <div>
                <input
                  className={`input ${errors.name ? 'border-red-500 bg-red-50' : ''}`}
                  placeholder="Name *"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  onBlur={() => { const e = validate(form); if (e.name) setErrors((c) => ({ ...c, name: e.name })) }}
                />
                {errors.name && <p className="mt-1 text-xs font-bold text-red-600">{errors.name}</p>}
              </div>
              <div>
                <input
                  className={`input ${errors.email ? 'border-red-500 bg-red-50' : ''}`}
                  type="email"
                  placeholder="Email *"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  onBlur={() => { const e = validate(form); if (e.email) setErrors((c) => ({ ...c, email: e.email })) }}
                />
                {errors.email && <p className="mt-1 text-xs font-bold text-red-600">{errors.email}</p>}
              </div>
              <div>
                <input
                  className={`input ${errors.phone ? 'border-red-500 bg-red-50' : ''}`}
                  placeholder="Phone (optional)"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  onBlur={() => { const e = validate(form); if (e.phone) setErrors((c) => ({ ...c, phone: e.phone })) }}
                />
                {errors.phone && <p className="mt-1 text-xs font-bold text-red-600">{errors.phone}</p>}
              </div>
              <select className="input" value={form.category} onChange={(e) => set('category', e.target.value)}>
                {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <div>
                <textarea
                  className={`input min-h-40 ${errors.message ? 'border-red-500 bg-red-50' : ''}`}
                  placeholder="Message * (at least 20 characters)"
                  value={form.message}
                  onChange={(e) => set('message', e.target.value)}
                  onBlur={() => { const e = validate(form); if (e.message) setErrors((c) => ({ ...c, message: e.message })) }}
                />
                {errors.message && <p className="mt-1 text-xs font-bold text-red-600">{errors.message}</p>}
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-md bg-[#E31837] px-5 py-3 font-black text-white disabled:opacity-60"
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </form>
          )}
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <h3 className="font-display text-2xl font-black">Contact info</h3>
            <p className="mt-4 font-bold text-zinc-600">support@sigfleet.com</p>
            <p className="mt-2 font-bold text-zinc-600">+91-80-XXXX-XXXX</p>
          </div>
        </div>
      </Section>
    </PublicShell>
  )
}
