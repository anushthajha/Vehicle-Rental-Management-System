import React, { useState } from 'react'
import { Loader2, MailCheck } from 'lucide-react'
import AuthLayout from './AuthLayout'
import api from '../../services/api'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setIsLoading(true)
    setError('')
    try {
      await api.post('/auth/forgot-password', { email })
      setSuccess(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Please wait before requesting another reset.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout compact>
      <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
        {success ? (
          <div className="text-center">
            <MailCheck className="mx-auto text-sigfleet" size={52} />
            <h1 className="mt-5 text-2xl font-black text-zinc-950">Check your email</h1>
            <p className="mt-3 text-zinc-600">If an account exists, a reset link has been sent.</p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-black text-zinc-950">Forgot password</h1>
            <p className="mt-2 text-sm text-zinc-500">Enter your email and we'll send a secure reset link.</p>
            {error && <div className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            <label className="mt-6 block text-sm font-bold text-zinc-800">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="mt-2 w-full rounded-md border-zinc-300" /></label>
            <button type="submit" disabled={isLoading} className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-sigfleet px-4 font-bold text-white disabled:opacity-70">
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Send reset link'}
            </button>
          </>
        )}
      </form>
    </AuthLayout>
  )
}
