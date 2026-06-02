import React, { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Eye, EyeOff, Loader2, MailCheck } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthLayout from './AuthLayout'
import PasswordStrengthMeter from './PasswordStrengthMeter'
import api from '../../services/api'
import { collectZodErrors, resetPasswordSchema } from '../../utils/validationSchemas'

// 3-step OTP-based password reset:
//   Step 1 — Enter email → send OTP
//   Step 2 — Enter 6-digit OTP
//   Step 3 — Set new password

const RESEND_COOLDOWN = 60

export default function ForgotPasswordPage() {
  const location = useLocation()
  const navigate = useNavigate()

  // ── shared state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState(location.state?.email || '')
  const [emailError, setEmailError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // ── step 2 — OTP ──────────────────────────────────────────────────────────
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [otpError, setOtpError] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const inputRefs = useRef([])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  // ── step 3 — new password ─────────────────────────────────────────────────
  const [passwords, setPasswords] = useState({ new_password: '', confirm_password: '' })
  const [passwordErrors, setPasswordErrors] = useState({})
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [done, setDone] = useState(false)
  const [countdown, setCountdown] = useState(null)

  useEffect(() => {
    if (countdown === null) return
    if (countdown === 0) { navigate('/auth/login', { replace: true }); return }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown, navigate])

  // ── Step 1: send OTP ──────────────────────────────────────────────────────
  async function sendOtp(event) {
    event?.preventDefault()
    if (!email.trim()) { setEmailError('Email is required'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setEmailError('Enter a valid email address'); return }
    setEmailError('')
    setIsLoading(true)
    setError('')
    try {
      await api.post('/auth/forgot-password-otp', { email: email.trim() })
      setStep(2)
      setCooldown(RESEND_COOLDOWN)
      // Focus first OTP box
      setTimeout(() => inputRefs.current[0]?.focus(), 100)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not send OTP. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Step 2: verify OTP ────────────────────────────────────────────────────
  function handleOtpInput(index, value) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...otp]
    next[index] = digit
    setOtp(next)
    setOtpError('')
    if (digit && index < 5) inputRefs.current[index + 1]?.focus()
    // Auto-submit when all 6 digits filled
    if (digit && index === 5 && next.every(Boolean)) {
      verifyOtp(next.join(''))
    }
  }

  function handleOtpKeyDown(index, e) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  function handleOtpPaste(e) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      const next = pasted.split('')
      setOtp(next)
      setOtpError('')
      inputRefs.current[5]?.focus()
      verifyOtp(pasted)
    }
  }

  async function verifyOtp(code) {
    const otpCode = code || otp.join('')
    if (otpCode.length < 6) { setOtpError('Enter all 6 digits'); return }
    setIsLoading(true)
    setOtpError('')
    setError('')
    try {
      await api.post('/auth/forgot-password-otp/verify', { email: email.trim(), otp: otpCode })
      setStep(3)
    } catch (err) {
      const msg = err.response?.data?.detail || 'Incorrect OTP. Please try again.'
      setOtpError(msg)
      // Clear boxes on wrong OTP
      setOtp(['', '', '', '', '', ''])
      setTimeout(() => inputRefs.current[0]?.focus(), 50)
    } finally {
      setIsLoading(false)
    }
  }

  // ── Step 3: set new password ──────────────────────────────────────────────
  async function resetPassword(event) {
    event.preventDefault()
    const parsed = resetPasswordSchema.safeParse(passwords)
    if (!parsed.success) {
      setPasswordErrors(collectZodErrors(parsed.error))
      return
    }
    setPasswordErrors({})
    setIsLoading(true)
    setError('')
    try {
      await api.post('/auth/forgot-password-otp/reset', {
        email: email.trim(),
        otp: otp.join(''),
        new_password: passwords.new_password,
        confirm_password: passwords.confirm_password,
      })
      setDone(true)
      setCountdown(3)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not reset password. Please start over.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AuthLayout compact>
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">

        {/* Success state */}
        {done && (
          <div className="text-center">
            <CheckCircle2 className="mx-auto text-emerald-600" size={56} />
            <h1 className="mt-5 text-2xl font-black text-zinc-950">Password reset!</h1>
            <p className="mt-3 text-zinc-600">Redirecting to login in {countdown}s...</p>
          </div>
        )}

        {/* Step 1 — Email */}
        {!done && step === 1 && (
          <form onSubmit={sendOtp}>
            <h1 className="text-2xl font-black text-zinc-950">Forgot password</h1>
            <p className="mt-2 text-sm text-zinc-500">
              Enter your email and we'll send a 6-digit OTP to reset your password.
            </p>
            {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            <label className="mt-6 block text-sm font-bold text-zinc-800">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailError('') }}
                onBlur={() => { if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) setEmailError('Enter a valid email address') }}
                className={`mt-2 w-full rounded-md border-zinc-300 ${emailError ? 'border-red-500 bg-red-50' : ''}`}
                placeholder="you@example.com"
                autoFocus
              />
              {emailError && <span className="mt-1 block text-xs font-bold text-red-600">{emailError}</span>}
            </label>
            <button
              type="submit"
              disabled={isLoading}
              className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-sigfleet px-4 font-bold text-white disabled:opacity-70"
            >
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Send OTP'}
            </button>
            <p className="mt-5 text-center text-sm text-zinc-500">
              Remember it?{' '}
              <Link to="/auth/login" className="font-bold text-sigfleet">Back to login</Link>
            </p>
          </form>
        )}

        {/* Step 2 — OTP */}
        {!done && step === 2 && (
          <div>
            <div className="text-center">
              <MailCheck className="mx-auto text-sigfleet" size={48} />
              <h1 className="mt-4 text-2xl font-black text-zinc-950">Check your email</h1>
              <p className="mt-2 text-sm text-zinc-500">
                We sent a 6-digit code to <strong>{email}</strong>
              </p>
            </div>

            {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            {/* OTP boxes */}
            <div className="mt-6 flex justify-center gap-2" onPaste={handleOtpPaste}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpInput(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  className={`h-14 w-12 rounded-lg border-2 text-center text-2xl font-black outline-none transition
                    ${otpError ? 'border-red-400 bg-red-50 text-red-700' : digit ? 'border-sigfleet bg-red-50 text-sigfleet' : 'border-zinc-300 focus:border-sigfleet'}`}
                />
              ))}
            </div>
            {otpError && <p className="mt-3 text-center text-sm font-bold text-red-600">{otpError}</p>}

            <button
              onClick={() => verifyOtp()}
              disabled={isLoading || otp.some((d) => !d)}
              className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-sigfleet px-4 font-bold text-white disabled:opacity-70"
            >
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Verify OTP'}
            </button>

            {/* Resend */}
            <div className="mt-4 text-center text-sm text-zinc-500">
              Didn't receive it?{' '}
              {cooldown > 0 ? (
                <span className="font-bold text-zinc-400">Resend in {cooldown}s</span>
              ) : (
                <button onClick={sendOtp} className="font-bold text-sigfleet hover:underline">
                  Resend OTP
                </button>
              )}
            </div>
            <button onClick={() => setStep(1)} className="mt-3 w-full text-center text-sm font-bold text-zinc-400 hover:text-zinc-600">
              ← Change email
            </button>
          </div>
        )}

        {/* Step 3 — New password */}
        {!done && step === 3 && (
          <form onSubmit={resetPassword}>
            <h1 className="text-2xl font-black text-zinc-950">Set new password</h1>
            <p className="mt-2 text-sm text-zinc-500">Choose a strong password for your account.</p>

            {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            {/* New password */}
            <label className="mt-6 block text-sm font-bold text-zinc-800">
              New password <span className="text-red-500">*</span>
              <div className="relative mt-2">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={passwords.new_password}
                  onChange={(e) => { setPasswords((c) => ({ ...c, new_password: e.target.value })); setPasswordErrors((c) => ({ ...c, new_password: undefined })) }}
                  className={`w-full rounded-md border-zinc-300 pr-12 ${passwordErrors.new_password ? 'border-red-500 bg-red-50' : ''}`}
                  autoFocus
                />
                <button type="button" onClick={() => setShowNew((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">
                  {showNew ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {passwordErrors.new_password && <span className="mt-1 block text-xs font-bold text-red-600">{passwordErrors.new_password}</span>}
            </label>
            <PasswordStrengthMeter password={passwords.new_password} />

            {/* Confirm password */}
            <label className="mt-4 block text-sm font-bold text-zinc-800">
              Confirm password <span className="text-red-500">*</span>
              <div className="relative mt-2">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={passwords.confirm_password}
                  onChange={(e) => { setPasswords((c) => ({ ...c, confirm_password: e.target.value })); setPasswordErrors((c) => ({ ...c, confirm_password: undefined })) }}
                  className={`w-full rounded-md border-zinc-300 pr-12 ${passwordErrors.confirm_password ? 'border-red-500 bg-red-50' : ''}`}
                />
                <button type="button" onClick={() => setShowConfirm((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">
                  {showConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {passwordErrors.confirm_password && <span className="mt-1 block text-xs font-bold text-red-600">{passwordErrors.confirm_password}</span>}
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-sigfleet px-4 font-bold text-white disabled:opacity-70"
            >
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Reset Password'}
            </button>
          </form>
        )}

        {/* Step indicator */}
        {!done && (
          <div className="mt-6 flex justify-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`h-1.5 w-8 rounded-full transition-all ${s <= step ? 'bg-sigfleet' : 'bg-zinc-200'}`} />
            ))}
          </div>
        )}
      </div>
    </AuthLayout>
  )
}
