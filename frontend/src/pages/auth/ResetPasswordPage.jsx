import React, { useEffect, useState } from 'react'
import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AuthLayout from './AuthLayout'
import PasswordStrengthMeter from './PasswordStrengthMeter'
import api from '../../services/api'
import { collectZodErrors, resetPasswordSchema } from '../../utils/validationSchemas'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [form, setForm] = useState({ new_password: '', confirm_password: '' })
  const [visible, setVisible] = useState(false)
  const [confirmVisible, setConfirmVisible] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [countdown, setCountdown] = useState(null)
  const token = searchParams.get('token') || ''

  useEffect(() => {
    if (countdown === null) return undefined
    if (countdown === 0) {
      navigate('/auth/login', { replace: true })
      return undefined
    }
    const timeout = window.setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => window.clearTimeout(timeout)
  }, [countdown, navigate])

  const update = (e) => {
    const { name, value } = e.target
    setForm((c) => ({ ...c, [name]: value }))
    if (fieldErrors[name]) setFieldErrors((c) => ({ ...c, [name]: undefined }))
  }

  async function submit(event) {
    event.preventDefault()
    const parsed = resetPasswordSchema.safeParse(form)
    if (!parsed.success) {
      setFieldErrors(collectZodErrors(parsed.error))
      return
    }
    setIsLoading(true)
    setError('')
    setFieldErrors({})
    try {
      await api.post('/auth/reset-password', { token, new_password: form.new_password, confirm_password: form.confirm_password })
      setCountdown(3)
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to reset password. The link may have expired.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout compact>
      <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
        {countdown !== null ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto text-emerald-600" size={56} />
            <h1 className="mt-5 text-2xl font-black text-zinc-950">Password reset!</h1>
            <p className="mt-3 text-zinc-600">Redirecting to login in {countdown}s...</p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-black text-zinc-950">Reset password</h1>
            <p className="mt-2 text-sm text-zinc-500">Choose a strong new password for your account.</p>

            {error && (
              <div className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            <PasswordField
              label="New password"
              name="new_password"
              value={form.new_password}
              visible={visible}
              setVisible={setVisible}
              onChange={update}
              error={fieldErrors.new_password}
            />
            <PasswordStrengthMeter password={form.new_password} />

            <PasswordField
              label="Confirm password"
              name="confirm_password"
              value={form.confirm_password}
              visible={confirmVisible}
              setVisible={setConfirmVisible}
              onChange={update}
              error={fieldErrors.confirm_password}
            />

            <button
              type="submit"
              disabled={isLoading || !token}
              className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-sigfleet px-4 font-bold text-white disabled:opacity-70"
            >
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Reset password'}
            </button>
          </>
        )}
      </form>
    </AuthLayout>
  )
}

function PasswordField({ label, name, value, onChange, visible, setVisible, error }) {
  return (
    <label className="mt-5 block text-sm font-bold text-zinc-800">
      {label}
      <div className="relative mt-2">
        <input
          name={name}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          required
          className={`w-full rounded-md border-zinc-300 pr-12 ${error ? 'border-red-500 bg-red-50' : ''}`}
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
