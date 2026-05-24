import React, { useState } from 'react'
import { Eye, EyeOff, Loader2, MailCheck } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import AuthLayout from './AuthLayout'
import PasswordStrengthMeter from './PasswordStrengthMeter'
import api from '../../services/api'
import { collectZodErrors, registerSchema } from '../../utils/validationSchemas'

export default function RegisterPage() {
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', confirm_password: '', terms: false })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [success, setSuccess] = useState(false)

  const update = (event) => {
    const { name, value, type, checked } = event.target
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
  }

  async function submit(event) {
    event.preventDefault()
    const parsed = registerSchema.safeParse(form)
    if (!parsed.success) {
      setFieldErrors(collectZodErrors(parsed.error))
      return
    }
    setIsLoading(true)
    setError('')
    setFieldErrors({})
    try {
      await api.post('/auth/register', {
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        confirm_password: form.confirm_password,
      })
      setSuccess(true)
      toast.success('Registration successful. Check your email.')
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to create account. Please check your details.')
      toast.error('Registration failed')
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <AuthLayout>
        <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <MailCheck className="mx-auto text-sigfleet" size={56} />
          <h2 className="mt-5 text-3xl font-black text-zinc-950">Check your inbox</h2>
          <p className="mt-3 text-zinc-600">We sent a verification link to finish creating your SigFleet account.</p>
          <Link className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-sigfleet px-5 font-bold text-white" to="/auth/login">Back to login</Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <Helmet><title>Sign Up | SigFleet</title><meta name="robots" content="noindex" /></Helmet>
      <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
        <h2 className="text-3xl font-black text-zinc-950">Create account</h2>
        <p className="mt-2 text-sm text-zinc-500">Verify your email once, then book and host securely.</p>
        {error && <div className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <FieldError name="full_name" error={fieldErrors.full_name}><label className="mt-6 block text-sm font-bold text-zinc-800">Full Name<input name="full_name" value={form.full_name} onChange={update} required className={`mt-2 w-full rounded-md border-zinc-300 ${fieldErrors.full_name ? 'border-red-500' : ''}`} /></label></FieldError>
        <FieldError name="email" error={fieldErrors.email}><label className="mt-4 block text-sm font-bold text-zinc-800">Email<input name="email" type="email" value={form.email} onChange={update} required className={`mt-2 w-full rounded-md border-zinc-300 ${fieldErrors.email ? 'border-red-500' : ''}`} /></label></FieldError>
        <FieldError name="phone" error={fieldErrors.phone}><label className="mt-4 block text-sm font-bold text-zinc-800">Phone<input name="phone" type="tel" placeholder="+91 9876543210" value={form.phone} onChange={update} required className={`mt-2 w-full rounded-md border-zinc-300 ${fieldErrors.phone ? 'border-red-500' : ''}`} /></label></FieldError>

        <PasswordInput label="Password" name="password" value={form.password} onChange={update} visible={showPassword} setVisible={setShowPassword} error={fieldErrors.password} />
        <PasswordStrengthMeter password={form.password} />
        <PasswordInput label="Confirm Password" name="confirm_password" value={form.confirm_password} onChange={update} visible={showConfirm} setVisible={setShowConfirm} error={fieldErrors.confirm_password} />

        <label className="mt-5 flex items-start gap-3 text-sm text-zinc-600">
          <input name="terms" type="checkbox" checked={form.terms} onChange={update} className="mt-1 rounded border-zinc-300 text-sigfleet" />
          <span>I agree to the <a href="/terms" target="_blank" className="font-bold text-sigfleet" rel="noreferrer">Terms of Service</a> and <a href="/privacy" target="_blank" className="font-bold text-sigfleet" rel="noreferrer">Privacy Policy</a>.</span>
        </label>
        {fieldErrors.terms && <span className="mt-1 block text-xs font-bold text-red-600">{fieldErrors.terms}</span>}

        <button type="submit" disabled={isLoading} className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-sigfleet px-4 font-bold text-white disabled:opacity-70">
          {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Create account'}
        </button>
        <p className="mt-6 text-center text-sm text-zinc-600">Already have an account? <Link className="font-bold text-sigfleet" to="/auth/login">Log in</Link></p>
      </form>
    </AuthLayout>
  )
}

function PasswordInput({ label, name, value, onChange, visible, setVisible, error }) {
  return (
    <label className="mt-4 block text-sm font-bold text-zinc-800">
      {label}
      <div className="relative mt-2">
        <input name={name} type={visible ? 'text' : 'password'} value={value} onChange={onChange} required className={`w-full rounded-md border-zinc-300 pr-12 ${error ? 'border-red-500' : ''}`} />
        <button type="button" onClick={() => setVisible((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" aria-label={`Toggle ${label.toLowerCase()} visibility`}>
          {visible ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
      {error && <span className="mt-1 block text-xs font-bold text-red-600">{error}</span>}
    </label>
  )
}

function FieldError({ children, error }) {
  return <>{children}{error && <span className="mt-1 block text-xs font-bold text-red-600">{error}</span>}</>
}
