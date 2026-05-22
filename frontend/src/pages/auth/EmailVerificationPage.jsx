import React, { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import AuthLayout from './AuthLayout'
import api from '../../services/api'

export default function EmailVerificationPage() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('loading')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const token = searchParams.get('token')

  useEffect(() => {
    async function verify() {
      if (!token) {
        setStatus('failed')
        return
      }
      try {
        await api.post(`/auth/verify-email?token=${encodeURIComponent(token)}`)
        setStatus('success')
      } catch {
        setStatus('failed')
      }
    }
    verify()
  }, [token])

  async function resend(event) {
    event.preventDefault()
    await api.post('/auth/resend-verification', { email })
    setMessage('If unverified, a new link has been sent.')
  }

  return (
    <AuthLayout compact>
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
        {status === 'loading' && (
          <>
            <Loader2 className="mx-auto animate-spin text-zoomcar" size={52} />
            <h1 className="mt-5 text-2xl font-black text-zinc-950">Verifying your email...</h1>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 className="mx-auto text-emerald-600" size={58} />
            <h1 className="mt-5 text-2xl font-black text-zinc-950">Email Verified!</h1>
            <p className="mt-3 text-zinc-600">You're ready to explore Zoomcar.</p>
            <Link className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-zoomcar px-5 font-bold text-white" to="/auth/login">Login</Link>
          </>
        )}
        {status === 'failed' && (
          <>
            <XCircle className="mx-auto text-red-600" size={58} />
            <h1 className="mt-5 text-2xl font-black text-zinc-950">Link expired or invalid.</h1>
            <form onSubmit={resend} className="mt-6 text-left">
              <label className="block text-sm font-bold text-zinc-800">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="mt-2 w-full rounded-md border-zinc-300" /></label>
              <button className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-zoomcar px-4 font-bold text-white" type="submit">Request new link</button>
            </form>
            {message && <p className="mt-4 text-sm text-zinc-600">{message}</p>}
          </>
        )}
      </div>
    </AuthLayout>
  )
}
