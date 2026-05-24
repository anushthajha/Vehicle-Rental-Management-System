import React, { useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import toast from 'react-hot-toast'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import AuthLayout from './AuthLayout'
import api from '../../services/api'
import { redirectPathForRole, useAuthStore } from '../../context/AuthContext'
import { collectZodErrors, loginSchema } from '../../utils/validationSchemas'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { setTokens, setUser } = useAuthStore()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [needsVerification, setNeedsVerification] = useState(false)
  const [resendMessage, setResendMessage] = useState('')

  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))

  async function submit(event) {
    event.preventDefault()
    const parsed = loginSchema.safeParse(form)
    if (!parsed.success) {
      setFieldErrors(collectZodErrors(parsed.error))
      return
    }
    setIsLoading(true)
    setError('')
    setFieldErrors({})
    setNeedsVerification(false)
    try {
      const response = await api.post('/auth/login', form)
      setTokens({ accessToken: response.data.access_token, refreshToken: response.data.refresh_token })
      setUser(response.data.user)
      toast.success('Logged in successfully')
      const next = location.state?.from?.pathname || searchParams.get('next') || redirectPathForRole(response.data.user?.role)
      navigate(next, { replace: true })
    } catch (err) {
      const detail = err.response?.data?.detail
      if (detail?.detail === 'EMAIL_NOT_VERIFIED') {
        setNeedsVerification(true)
        setError(detail.message)
      } else {
        setError(typeof detail === 'string' ? detail : 'Unable to log in. Please try again.')
      }
      toast.error('Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  async function resendVerification() {
    setResendMessage('')
    await api.post('/auth/resend-verification', { email: form.email })
    setResendMessage('A new verification link has been sent if this email is unverified.')
    toast.success('Verification email sent')
  }

  return (
    <AuthLayout>
      <Helmet><title>Login | SigFleet</title><meta name="robots" content="noindex" /></Helmet>
      <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
        <h2 className="text-3xl font-black text-zinc-950">Log in</h2>
        <p className="mt-2 text-sm text-zinc-500">Manage bookings, wallet, and trips from one secure account.</p>

        {error && (
          <div className={`mt-5 rounded-md border p-3 text-sm ${needsVerification ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-700'}`}>
            <div>{error}</div>
            {needsVerification && (
              <button type="button" onClick={resendVerification} className="mt-2 font-bold text-amber-950 underline">
                Resend verification email
              </button>
            )}
            {resendMessage && <div className="mt-2 text-amber-800">{resendMessage}</div>}
          </div>
        )}

        <label className="mt-6 block text-sm font-bold text-zinc-800">
          Email
          <input name="email" type="email" value={form.email} onChange={update} required className={`mt-2 w-full rounded-md border-zinc-300 ${fieldErrors.email ? 'border-red-500' : ''}`} />
          {fieldErrors.email && <span className="mt-1 block text-xs font-bold text-red-600">{fieldErrors.email}</span>}
        </label>

        <label className="mt-4 block text-sm font-bold text-zinc-800">
          Password
          <div className="relative mt-2">
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={update}
              required
              className={`w-full rounded-md border-zinc-300 pr-12 ${fieldErrors.password ? 'border-red-500' : ''}`}
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" aria-label="Toggle password visibility">
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          {fieldErrors.password && <span className="mt-1 block text-xs font-bold text-red-600">{fieldErrors.password}</span>}
        </label>

        <div className="mt-3 text-right">
          <Link className="text-sm font-bold text-sigfleet" to="/auth/forgot-password">Forgot Password?</Link>
        </div>

        <button type="submit" disabled={isLoading} className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-sigfleet px-4 font-bold text-white disabled:opacity-70">
          {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Log in'}
        </button>

        <div className="my-6 h-px bg-zinc-200" />
        <p className="text-center text-sm text-zinc-600">
          New to SigFleet? <Link className="font-bold text-sigfleet" to="/auth/register">Create an account</Link>
        </p>
      </form>
    </AuthLayout>
  )
}
