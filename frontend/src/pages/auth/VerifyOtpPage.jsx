import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import toast from 'react-hot-toast'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, Mail } from 'lucide-react'
import AuthLayout from './AuthLayout'
import api from '../../services/api'
import { redirectPathForRole, useAuthStore } from '../../context/AuthContext'

const OTP_LENGTH = 6
const RESEND_COOLDOWN = 60 // seconds

function maskEmail(email = '') {
  const [local, domain] = email.split('@')
  if (!domain) return email
  const masked = local.length <= 2 ? local[0] + '***' : local[0] + '***' + local.slice(-1)
  return `${masked}@${domain}`
}

export default function VerifyOtpPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setAccessToken, setUser } = useAuthStore()

  // Resolve email from router state or query param
  const email = location.state?.email || searchParams.get('email') || ''

  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''))
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN)
  const [success, setSuccess] = useState(false)

  const inputRefs = useRef([])

  // Redirect if no email
  useEffect(() => {
    if (!email) {
      navigate('/auth/register', { replace: true })
    }
  }, [email, navigate])

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000)
    return () => clearInterval(timer)
  }, [countdown])

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  const triggerShake = useCallback(() => {
    setShake(true)
    setTimeout(() => setShake(false), 600)
  }, [])

  const clearDigits = useCallback(() => {
    setDigits(Array(OTP_LENGTH).fill(''))
    setTimeout(() => inputRefs.current[0]?.focus(), 50)
  }, [])

  async function verifyOtp(otp) {
    setIsVerifying(true)
    setError('')
    try {
      const response = await api.post('/auth/verify-otp', { email, otp })
      const data = response.data
      setAccessToken(data.access_token)
      setUser(data.user)
      setSuccess(true)
      toast.success('Email verified! Welcome to SigFleet.')
      setTimeout(() => {
        navigate(redirectPathForRole(data.user?.role), { replace: true })
      }, 1000)
    } catch (err) {
      const detail = err.response?.data?.detail
      const message =
        typeof detail === 'string'
          ? detail
          : detail?.message || err.message || 'Verification failed. Please try again.'
      setError(message)
      triggerShake()
      clearDigits()
    } finally {
      setIsVerifying(false)
    }
  }

  function handleChange(index, value) {
    // Only accept single digit
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    setError('')

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }

    // Auto-submit when all digits filled
    if (digit && index === OTP_LENGTH - 1) {
      const otp = next.join('')
      if (otp.length === OTP_LENGTH) {
        verifyOtp(otp)
      }
    }
  }

  function handleKeyDown(index, event) {
    if (event.key === 'Backspace') {
      if (digits[index]) {
        const next = [...digits]
        next[index] = ''
        setDigits(next)
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus()
        const next = [...digits]
        next[index - 1] = ''
        setDigits(next)
      }
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
    if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handlePaste(event) {
    event.preventDefault()
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (!pasted) return
    const next = Array(OTP_LENGTH).fill('')
    pasted.split('').forEach((ch, i) => { next[i] = ch })
    setDigits(next)
    setError('')
    const focusIndex = Math.min(pasted.length, OTP_LENGTH - 1)
    inputRefs.current[focusIndex]?.focus()
    if (pasted.length === OTP_LENGTH) {
      verifyOtp(pasted)
    }
  }

  async function handleResend() {
    if (countdown > 0 || isResending) return
    setIsResending(true)
    setError('')
    try {
      await api.post('/auth/resend-otp', { email })
      toast.success('New verification code sent to your email.')
      setCountdown(RESEND_COOLDOWN)
      clearDigits()
    } catch (err) {
      const detail = err.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'Failed to resend code. Please try again.')
    } finally {
      setIsResending(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    const otp = digits.join('')
    if (otp.length < OTP_LENGTH) {
      setError('Please enter all 6 digits.')
      return
    }
    verifyOtp(otp)
  }

  const isTooManyAttempts = error.toLowerCase().includes('too many')

  return (
    <AuthLayout>
      <Helmet>
        <title>Verify Email | SigFleet</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8 shadow-sm text-center">
        {success ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="text-5xl">✅</div>
            <h2 className="text-2xl font-black text-zinc-950">Email verified!</h2>
            <p className="text-zinc-500">Redirecting you to your dashboard…</p>
          </div>
        ) : (
          <>
            <div className="flex justify-center mb-4">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-red-50 text-[#E31837]">
                <Mail size={28} />
              </div>
            </div>

            <h2 className="text-2xl font-black text-zinc-950">Check your email</h2>
            <p className="mt-2 text-sm text-zinc-500">
              We sent a 6-digit code to
            </p>
            <p className="mt-1 text-sm font-bold text-zinc-800">{maskEmail(email)}</p>

            <form onSubmit={handleSubmit} className="mt-8">
              {/* OTP input boxes */}
              <div
                className={`flex justify-center gap-2 transition-all ${shake ? 'animate-shake' : ''}`}
                style={shake ? { animation: 'shake 0.5s ease-in-out' } : {}}
              >
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => { inputRefs.current[index] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={handlePaste}
                    disabled={isVerifying || isTooManyAttempts}
                    aria-label={`Digit ${index + 1}`}
                    className={`h-14 w-11 rounded-lg border-2 text-center text-xl font-black transition-all focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 disabled:opacity-50 ${
                      error
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : digit
                        ? 'border-[#E31837] bg-red-50 text-[#E31837]'
                        : 'border-zinc-300 bg-white text-zinc-900'
                    }`}
                  />
                ))}
              </div>

              {error && (
                <p className="mt-3 text-sm font-bold text-red-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={isVerifying || digits.join('').length < OTP_LENGTH || isTooManyAttempts}
                className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-[#E31837] px-4 font-bold text-white disabled:opacity-60 transition"
              >
                {isVerifying ? <Loader2 className="animate-spin" size={20} /> : 'Verify Email'}
              </button>
            </form>

            {/* Resend section */}
            <div className="mt-6 text-sm text-zinc-500">
              <p>Didn't receive it?</p>
              <button
                type="button"
                onClick={handleResend}
                disabled={countdown > 0 || isResending}
                className="mt-1 font-bold text-[#E31837] disabled:text-zinc-400 disabled:cursor-not-allowed transition"
              >
                {isResending ? (
                  <span className="flex items-center gap-1 justify-center">
                    <Loader2 className="animate-spin" size={14} /> Sending…
                  </span>
                ) : countdown > 0 ? (
                  `Resend in 0:${String(countdown).padStart(2, '0')}`
                ) : (
                  'Resend OTP'
                )}
              </button>
            </div>

            <div className="mt-4 text-sm text-zinc-400">
              Wrong email?{' '}
              <button
                type="button"
                onClick={() => navigate('/auth/register', { replace: true })}
                className="font-bold text-zinc-600 hover:text-zinc-900 transition"
              >
                Change email
              </button>
            </div>
          </>
        )}
      </div>

      {/* Shake animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-6px); }
          30% { transform: translateX(6px); }
          45% { transform: translateX(-4px); }
          60% { transform: translateX(4px); }
          75% { transform: translateX(-2px); }
          90% { transform: translateX(2px); }
        }
        .animate-shake { animation: shake 0.5s ease-in-out; }
      `}</style>
    </AuthLayout>
  )
}
