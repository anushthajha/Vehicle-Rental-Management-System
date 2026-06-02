import React, { useEffect, useState } from 'react'
import { Eye, EyeOff, Info, Loader2 } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import toast from 'react-hot-toast'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthLayout from './AuthLayout'
import PasswordStrengthMeter from './PasswordStrengthMeter'
import api from '../../services/api'
import { collectApiFieldErrors, collectZodErrors, registerSchema } from '../../utils/validationSchemas'

export default function RegisterPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const managerIntent = location.state?.intendedRole === 'vehicle_manager'
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    confirm_password: '',
    role: managerIntent ? 'vehicle_manager' : 'customer',
    terms: false,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    if (managerIntent) {
      setForm((current) => ({ ...current, role: 'vehicle_manager' }))
    }
  }, [managerIntent])

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
        role: form.role,
      })

      if (form.role === 'vehicle_manager') {
        toast.success('Registration successful! Awaiting admin approval.')
        navigate('/auth/login', {
          replace: true,
          state: { notice: 'Registration successful! Awaiting admin approval.' },
        })
        return
      }

      // Customer: redirect to OTP verification
      toast.success('Account created! Check your email for the verification code.')
      navigate('/auth/verify-otp', {
        state: { email: form.email },
        replace: false,
      })
    } catch (err) {
      const detail = err.response?.data?.detail
      const apiFieldErrors = collectApiFieldErrors(detail)
      const message =
        typeof detail === 'string'
          ? detail
          : detail?.message ||
            Object.values(apiFieldErrors)[0] ||
            err.message ||
            'Unable to create account. Please check your details.'
      setError(message)
      if (Object.keys(apiFieldErrors).length) {
        setFieldErrors(apiFieldErrors)
      }
      if (err.status === 409 || message.toLowerCase().includes('email already')) {
        setFieldErrors((current) => ({
          ...current,
          email: 'This email is already registered. Log in or use forgot password.',
        }))
      }
      toast.error('Registration failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout>
      <Helmet>
        <title>Sign Up | SigFleet</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
        <h2 className="text-3xl font-black text-zinc-950">Create account</h2>
        <p className="mt-2 text-sm text-zinc-500">Verify your email once, then book and manage securely.</p>

        {managerIntent && (
          <div className="mt-5 flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
            <Info className="mt-0.5 shrink-0" size={18} />
            <p>
              You are registering as a Vehicle Manager. Your account will be reviewed and approved by an admin before
              you can list vehicles.
            </p>
          </div>
        )}

        {error && (
          <div className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <FieldError error={fieldErrors.full_name}>
          <label className="mt-6 block text-sm font-bold text-zinc-800">
            Full Name
            <input
              name="full_name"
              value={form.full_name}
              onChange={(e) => {
                // Only allow letters and spaces
                const val = e.target.value.replace(/[^A-Za-z ]/g, '')
                setForm((c) => ({ ...c, full_name: val }))
                if (fieldErrors.full_name) setFieldErrors((c) => ({ ...c, full_name: undefined }))
              }}
              required
              placeholder="e.g. Ravi Kumar"
              className={`mt-2 w-full rounded-md border-zinc-300 ${fieldErrors.full_name ? 'border-red-500' : ''}`}
            />
          </label>
        </FieldError>

        <FieldError error={fieldErrors.email}>
          <label className="mt-4 block text-sm font-bold text-zinc-800">
            Email
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={update}
              required
              className={`mt-2 w-full rounded-md border-zinc-300 ${fieldErrors.email ? 'border-red-500' : ''}`}
            />
          </label>
        </FieldError>

        <div className="mt-4">
          <label className="block text-sm font-bold text-zinc-800">
            Phone <span className="text-xs font-normal text-zinc-400">(10-digit Indian mobile)</span>
          </label>
          <div className="mt-2 flex">
            <span className="grid h-11 place-items-center rounded-l-md border border-r-0 border-zinc-300 bg-zinc-100 px-3 text-sm font-bold text-zinc-500 select-none">+91</span>
            <input
              name="phone"
              type="tel"
              inputMode="numeric"
              value={form.phone}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
                setForm((c) => ({ ...c, phone: digits }))
                if (fieldErrors.phone) setFieldErrors((c) => ({ ...c, phone: undefined }))
              }}
              onBlur={() => {
                if (form.phone && !/^[6-9]\d{9}$/.test(form.phone)) {
                  setFieldErrors((c) => ({ ...c, phone: 'Enter a valid 10-digit Indian mobile number starting with 6–9' }))
                }
              }}
              maxLength={10}
              placeholder="9876543210"
              required
              className={`h-11 w-full rounded-r-md border border-zinc-300 px-3 text-sm outline-none focus:border-sigfleet focus:ring-1 focus:ring-sigfleet ${fieldErrors.phone ? 'border-red-500 bg-red-50' : ''}`}
            />
          </div>
          <div className="mt-1 flex items-center justify-between">
            {fieldErrors.phone
              ? <span className="text-xs font-bold text-red-600">{fieldErrors.phone}</span>
              : <span className="text-xs text-zinc-400">Do not include +91 — it's added automatically</span>
            }
            <span className={`text-xs font-bold ${form.phone.length === 10 ? 'text-emerald-600' : 'text-zinc-400'}`}>{form.phone.length}/10</span>
          </div>
        </div>

        <div className="mt-5 grid gap-2 text-sm font-bold text-zinc-800">
          <span>Register as</span>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['customer', 'Customer'],
              ['vehicle_manager', 'Vehicle Manager'],
            ].map(([value, label]) => (
              <label
                key={value}
                className={`rounded-md border p-3 text-center font-black ${
                  form.role === value
                    ? 'border-sigfleet bg-red-50 text-sigfleet'
                    : 'border-zinc-200 bg-white text-zinc-700'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={value}
                  checked={form.role === value}
                  onChange={update}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <PasswordInput
          label="Password"
          name="password"
          value={form.password}
          onChange={update}
          visible={showPassword}
          setVisible={setShowPassword}
          error={fieldErrors.password}
        />
        <PasswordStrengthMeter password={form.password} />
        <PasswordInput
          label="Confirm Password"
          name="confirm_password"
          value={form.confirm_password}
          onChange={update}
          visible={showConfirm}
          setVisible={setShowConfirm}
          error={fieldErrors.confirm_password}
        />

        <label className="mt-5 flex items-start gap-3 text-sm text-zinc-600">
          <input
            name="terms"
            type="checkbox"
            checked={form.terms}
            onChange={update}
            className="mt-1 rounded border-zinc-300 text-sigfleet"
          />
          <span>
            I agree to the{' '}
            <a href="/terms" target="_blank" className="font-bold text-sigfleet" rel="noreferrer">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="/privacy" target="_blank" className="font-bold text-sigfleet" rel="noreferrer">
              Privacy Policy
            </a>
            .
          </span>
        </label>
        {fieldErrors.terms && (
          <span className="mt-1 block text-xs font-bold text-red-600">{fieldErrors.terms}</span>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-sigfleet px-4 font-bold text-white disabled:opacity-70"
        >
          {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Create account'}
        </button>
        <p className="mt-6 text-center text-sm text-zinc-600">
          Already have an account?{' '}
          <Link className="font-bold text-sigfleet" to="/auth/login">
            Log in
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}

function PasswordInput({ label, name, value, onChange, visible, setVisible, error }) {
  return (
    <label className="mt-4 block text-sm font-bold text-zinc-800">
      {label}
      <div className="relative mt-2">
        <input
          name={name}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          required
          className={`w-full rounded-md border-zinc-300 pr-12 ${error ? 'border-red-500' : ''}`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"
          aria-label={`Toggle ${label.toLowerCase()} visibility`}
        >
          {visible ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
      {error && <span className="mt-1 block text-xs font-bold text-red-600">{error}</span>}
    </label>
  )
}

function FieldError({ children, error }) {
  return (
    <>
      {children}
      {error && <span className="mt-1 block text-xs font-bold text-red-600">{error}</span>}
    </>
  )
}
