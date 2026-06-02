import React, { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Building2, CheckCircle2, CreditCard, Loader2, Plus, Smartphone, Wallet } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { formatMoney } from '../../utils/searchData'
import { formatDateTime } from '../../utils/bookingUtils'

// Payment method tabs
const METHODS = [
  { key: 'card', label: 'Credit / Debit Card', icon: CreditCard },
  { key: 'upi', label: 'UPI', icon: Smartphone },
  { key: 'netbanking', label: 'Net Banking', icon: Building2 },
  { key: 'wallet', label: 'SigFleet Wallet', icon: Wallet },
]

export default function PaymentPage() {
  const { bookingId } = useParams()
  const navigate = useNavigate()
  const [booking, setBooking] = useState(null)
  const [walletData, setWalletData] = useState({ balance: 0 })
  const [method, setMethod] = useState('card')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogState, setDialogState] = useState('confirm')
  const [result, setResult] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addAmount, setAddAmount] = useState(1000)
  const [loadError, setLoadError] = useState('')

  // Card fields
  const [card, setCard] = useState({ number: '', expiry: '', cvv: '', name: '' })
  const [cardErrors, setCardErrors] = useState({})
  // UPI field
  const [upiId, setUpiId] = useState('')
  const [upiError, setUpiError] = useState('')
  // Net banking
  const [bank, setBank] = useState('')
  const [bankError, setBankError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [bookingRes, walletRes] = await Promise.all([
          api.get(`/bookings/${bookingId}`),
          api.get('/payments/wallet'),
        ])
        if (!cancelled) {
          setBooking(bookingRes.data)
          setWalletData(walletRes.data)
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err.response?.data?.detail || err.message || 'Failed to load payment details.'
          setLoadError(msg)
          toast.error(msg)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [bookingId])

  const total = Number(booking?.payment?.amount || booking?.total_amount || 0)
  const walletBalance = Number(walletData?.balance || 0)
  const deficit = Math.max(total - walletBalance, 0)
  const walletOk = deficit <= 0

  // Validate payment details before showing confirm dialog
  function validateAndPay() {
    let valid = true

    if (method === 'card') {
      const errors = {}
      const digits = card.number.replace(/\D/g, '')
      if (digits.length < 16) { errors.number = 'Enter a valid 16-digit card number'; valid = false }
      if (!card.expiry.match(/^\d{2}\/\d{2}$/)) {
        errors.expiry = 'Enter expiry as MM/YY'; valid = false
      } else {
        const [mm, yy] = card.expiry.split('/').map(Number)
        const now = new Date()
        const expYear = 2000 + yy
        const expMonth = mm - 1
        if (mm < 1 || mm > 12) { errors.expiry = 'Month must be 01–12'; valid = false }
        else if (new Date(expYear, expMonth + 1, 1) <= now) { errors.expiry = 'Card has expired'; valid = false }
      }
      if (card.cvv.length < 3) { errors.cvv = 'CVV must be 3–4 digits'; valid = false }
      if (!card.name.trim()) { errors.name = 'Cardholder name is required'; valid = false }
      setCardErrors(errors)
    }

    if (method === 'upi') {
      if (!upiId.trim()) { setUpiError('UPI ID is required'); valid = false }
      else if (!upiId.includes('@')) { setUpiError('Enter a valid UPI ID (e.g. name@paytm)'); valid = false }
      else if (!/^[\w.\-+]+@[\w]+$/.test(upiId.trim())) { setUpiError('Invalid UPI ID format'); valid = false }
      else setUpiError('')
    }

    if (method === 'netbanking') {
      if (!bank) { setBankError('Please select your bank'); valid = false }
      else setBankError('')
    }

    if (method === 'wallet' && !walletOk) {
      toast.error(`Insufficient wallet balance. Add ₹${formatMoney(deficit)} first.`)
      valid = false
    }

    if (valid) {
      setDialogState('confirm')
      setDialogOpen(true)
    }
  }

  async function addMoney() {
    try {
      const response = await api.post('/payments/wallet/add', { amount: Number(addAmount) })
      setWalletData((current) => ({ ...current, balance: response.data.new_balance }))
      setAddOpen(false)
      toast.success(`₹${formatMoney(addAmount)} added to wallet`)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add money')
    }
  }

  async function confirmPay() {
    setDialogState('processing')
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 1500))
      let response
      if (method === 'wallet') {
        response = await api.post('/payments/wallet/pay-booking', { booking_id: bookingId })
      } else {
        // Card, UPI, Net Banking all use simulate-payment
        response = await api.post(`/bookings/${bookingId}/simulate-payment`)
      }
      setResult(response.data)
      sessionStorage.setItem(
        'sigfleet_last_booking_success',
        JSON.stringify({ ...booking, transaction_id: response.data.transaction_id })
      )
      setDialogState('success')
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Payment failed. Please try again.'
      toast.error(typeof msg === 'string' ? msg : 'Payment failed. Please try again.')
      setDialogState('confirm')
    }
  }

  if (loadError) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-50 p-6">
        <div className="max-w-md rounded-lg border border-red-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-black text-zinc-950">Unable to load payment</h1>
          <p className="mt-2 font-semibold text-zinc-600">{loadError}</p>
          <button onClick={() => navigate(-1)} className="mt-5 rounded-md bg-sigfleet px-5 py-3 font-black text-white">Go Back</button>
        </div>
      </main>
    )
  }

  if (!booking) return <main className="grid min-h-screen place-items-center bg-zinc-50"><Loader2 className="animate-spin text-sigfleet" /></main>

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8">
      <section className="mx-auto max-w-3xl space-y-5">
        {/* Booking summary */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h1 className="text-3xl font-black text-zinc-950">Complete Payment</h1>
          <div className="mt-4 flex gap-4">
            <img
              src={booking.car?.primary_image_url || 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=500&q=80'}
              alt=""
              className="h-24 w-32 rounded-md object-cover"
            />
            <div>
              <p className="text-xl font-black text-zinc-950">{booking.car?.title}</p>
              <p className="text-sm font-bold text-zinc-500">
                {formatDateTime(booking.pickup_datetime)} — {formatDateTime(booking.return_datetime)}
              </p>
              <p className="mt-2 text-2xl font-black text-sigfleet">₹{formatMoney(total)}</p>
            </div>
          </div>
        </div>

        {booking.payment?.status === 'paid' ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
            <CheckCircle2 className="mx-auto text-emerald-600" size={44} />
            <h2 className="mt-3 text-2xl font-black text-emerald-900">Payment already completed</h2>
            <button onClick={() => navigate(`/booking/success?ref=${booking.booking_ref}`)} className="mt-4 rounded-md bg-sigfleet px-5 py-3 font-black text-white">
              View Confirmation
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <h2 className="text-xl font-black text-zinc-950">Select Payment Method</h2>

            {/* Method tabs */}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {METHODS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setMethod(key)}
                  className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 text-center transition ${
                    method === key ? 'border-sigfleet bg-red-50' : 'border-zinc-200 hover:border-zinc-300'
                  }`}
                >
                  <Icon size={22} className={method === key ? 'text-sigfleet' : 'text-zinc-500'} />
                  <span className={`text-xs font-black ${method === key ? 'text-sigfleet' : 'text-zinc-600'}`}>{label}</span>
                </button>
              ))}
            </div>

            {/* Method-specific fields */}
            <div className="mt-5">
              {method === 'card' && (
                <div className="space-y-3">
                  <p className="text-sm font-black text-zinc-700">Card Details</p>
                  <div>
                    <label className="text-xs font-bold text-zinc-500">Card Number <span className="text-red-500">*</span></label>
                    <input
                      className={`input mt-1 h-11 ${cardErrors.number ? 'border-red-500 bg-red-50' : ''}`}
                      value={card.number.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()}
                      onChange={(e) => { setCard((c) => ({ ...c, number: e.target.value })); setCardErrors((c) => ({ ...c, number: undefined })) }}
                      placeholder="1234 5678 9012 3456"
                      maxLength={19}
                    />
                    {cardErrors.number && <p className="mt-1 text-xs font-bold text-red-600">{cardErrors.number}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-zinc-500">Expiry (MM/YY) <span className="text-red-500">*</span></label>
                      <input
                        className={`input mt-1 h-11 ${cardErrors.expiry ? 'border-red-500 bg-red-50' : ''}`}
                        value={card.expiry}
                        onChange={(e) => {
                          let v = e.target.value.replace(/\D/g, '').slice(0, 4)
                          if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2)
                          setCard((c) => ({ ...c, expiry: v }))
                          setCardErrors((c) => ({ ...c, expiry: undefined }))
                        }}
                        placeholder="MM/YY"
                        maxLength={5}
                      />
                      {cardErrors.expiry && <p className="mt-1 text-xs font-bold text-red-600">{cardErrors.expiry}</p>}
                    </div>
                    <div>
                      <label className="text-xs font-bold text-zinc-500">CVV <span className="text-red-500">*</span></label>
                      <input
                        className={`input mt-1 h-11 ${cardErrors.cvv ? 'border-red-500 bg-red-50' : ''}`}
                        type="password"
                        value={card.cvv}
                        onChange={(e) => { setCard((c) => ({ ...c, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })); setCardErrors((c) => ({ ...c, cvv: undefined })) }}
                        placeholder="•••"
                        maxLength={4}
                      />
                      {cardErrors.cvv && <p className="mt-1 text-xs font-bold text-red-600">{cardErrors.cvv}</p>}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-zinc-500">Cardholder Name <span className="text-red-500">*</span></label>
                    <input
                      className={`input mt-1 h-11 ${cardErrors.name ? 'border-red-500 bg-red-50' : ''}`}
                      value={card.name}
                      onChange={(e) => { setCard((c) => ({ ...c, name: e.target.value })); setCardErrors((c) => ({ ...c, name: undefined })) }}
                      placeholder="Name as on card"
                    />
                    {cardErrors.name && <p className="mt-1 text-xs font-bold text-red-600">{cardErrors.name}</p>}
                  </div>
                  <p className="text-xs text-zinc-400">🔒 This is a simulated payment — no real card is charged.</p>
                </div>
              )}

              {method === 'upi' && (
                <div className="space-y-3">
                  <p className="text-sm font-black text-zinc-700">UPI Payment</p>
                  <div>
                    <label className="text-xs font-bold text-zinc-500">UPI ID <span className="text-red-500">*</span></label>
                    <input
                      className={`input mt-1 h-11 ${upiError ? 'border-red-500 bg-red-50' : ''}`}
                      value={upiId}
                      onChange={(e) => { setUpiId(e.target.value.trim()); setUpiError('') }}
                      placeholder="yourname@upi  (e.g. 9876543210@paytm)"
                    />
                    {upiError && <p className="mt-1 text-xs font-bold text-red-600">{upiError}</p>}
                  </div>
                  <div className="rounded-md bg-zinc-50 p-3 text-xs font-bold text-zinc-500">
                    Supported: PhonePe, Google Pay, Paytm, BHIM, and all UPI apps.
                    <br />🔒 Simulated — no real transaction occurs.
                  </div>
                </div>
              )}

              {method === 'netbanking' && (
                <div className="space-y-3">
                  <p className="text-sm font-black text-zinc-700">Net Banking</p>
                  <div>
                    <label className="text-xs font-bold text-zinc-500">Select Bank <span className="text-red-500">*</span></label>
                    <select
                      className={`input mt-1 h-11 ${bankError ? 'border-red-500 bg-red-50' : ''}`}
                      value={bank}
                      onChange={(e) => { setBank(e.target.value); setBankError('') }}
                    >
                      <option value="">— Choose your bank —</option>
                      {['SBI', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank', 'Punjab National Bank', 'Bank of Baroda', 'Canara Bank', 'Union Bank of India', 'IndusInd Bank', 'Yes Bank', 'IDFC First Bank', 'Federal Bank', 'Other'].map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                    {bankError && <p className="mt-1 text-xs font-bold text-red-600">{bankError}</p>}
                  </div>
                  <div className="rounded-md bg-zinc-50 p-3 text-xs font-bold text-zinc-500">
                    You will be redirected to your bank's secure portal to complete payment.
                    <br />🔒 Simulated — no real transaction occurs.
                  </div>
                </div>
              )}

              {method === 'wallet' && (
                <div className="space-y-3">
                  <div className={`rounded-md p-4 ${walletOk ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-black text-zinc-950">SigFleet Wallet</p>
                        <p className="text-sm font-bold text-zinc-600">Balance: ₹{formatMoney(walletBalance)}</p>
                      </div>
                      {walletOk ? (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">✓ Sufficient</span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">Insufficient</span>
                      )}
                    </div>
                    {!walletOk && (
                      <div className="mt-3">
                        <p className="text-sm font-bold text-amber-800">Need ₹{formatMoney(deficit)} more.</p>
                        <button onClick={() => setAddOpen(true)} className="mt-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-black text-white">
                          Add ₹{formatMoney(deficit)} to Wallet
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              disabled={method === 'wallet' && !walletOk}
              onClick={validateAndPay}
              className="mt-6 w-full rounded-md bg-sigfleet px-5 py-3 font-black text-white disabled:bg-zinc-300 disabled:cursor-not-allowed"
            >
              Pay ₹{formatMoney(total)}
            </button>
          </div>
        )}
      </section>

      {/* Confirm dialog */}
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content
            aria-describedby="payment-dialog-desc"
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-2xl"
          >
            <Dialog.Title className="text-2xl font-black text-zinc-950">
              {dialogState === 'success' ? 'Payment Successful!' : 'Confirm Payment'}
            </Dialog.Title>
            <Dialog.Description id="payment-dialog-desc" className="sr-only">
              {dialogState === 'success' ? 'Your payment was processed.' : 'Review and confirm your payment.'}
            </Dialog.Description>

            {dialogState === 'confirm' && (
              <div className="mt-4 space-y-2 text-sm font-bold text-zinc-700">
                <div className="rounded-md bg-zinc-50 p-4 space-y-1">
                  <p>Amount: <span className="text-sigfleet text-lg">₹{formatMoney(total)}</span></p>
                  <p>Booking: {booking.booking_ref}</p>
                  <p>Vehicle: {booking.car?.title}</p>
                  <p>Method: {METHODS.find((m) => m.key === method)?.label}</p>
                  {method === 'upi' && <p>UPI ID: {upiId}</p>}
                  {method === 'netbanking' && <p>Bank: {bank}</p>}
                </div>
                <p className="text-xs text-zinc-400">🔒 Safe demo environment — no real money is charged.</p>
                <div className="mt-5 flex justify-end gap-3">
                  <button onClick={() => setDialogOpen(false)} className="rounded-md border border-zinc-300 px-4 py-2 font-black">Cancel</button>
                  <button onClick={confirmPay} className="rounded-md bg-sigfleet px-4 py-2 font-black text-white">
                    Confirm & Pay ₹{formatMoney(total)}
                  </button>
                </div>
              </div>
            )}

            {dialogState === 'processing' && (
              <div className="grid min-h-40 place-items-center">
                <div className="text-center">
                  <Loader2 className="mx-auto animate-spin text-sigfleet" size={40} />
                  <p className="mt-3 font-black text-zinc-700">Processing payment...</p>
                  <p className="mt-1 text-sm text-zinc-500">Please do not close this window.</p>
                </div>
              </div>
            )}

            {dialogState === 'success' && (
              <div className="mt-4 text-center">
                <CheckCircle2 className="mx-auto text-emerald-600" size={56} />
                <h3 className="mt-3 text-xl font-black text-zinc-950">Payment Successful!</h3>
                <p className="mt-2 font-bold text-zinc-700">₹{formatMoney(total)} paid</p>
                {result?.transaction_id && (
                  <p className="mt-1 text-sm font-bold text-zinc-500">Txn ID: {result.transaction_id}</p>
                )}
                <button
                  onClick={() => navigate(`/booking/success?ref=${result?.booking_ref || booking.booking_ref}`)}
                  className="mt-5 rounded-md bg-sigfleet px-5 py-3 font-black text-white"
                >
                  View Booking Confirmation
                </button>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Add money dialog */}
      <Dialog.Root open={addOpen} onOpenChange={setAddOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content
            aria-describedby="add-money-desc"
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-5"
          >
            <Dialog.Title className="text-xl font-black text-zinc-950">Add Money to Wallet</Dialog.Title>
            <Dialog.Description id="add-money-desc" className="sr-only">Enter the amount to add to your wallet.</Dialog.Description>
            <label className="mt-4 block text-sm font-bold text-zinc-700">
              Amount (₹) <span className="text-red-500">*</span>
              <input
                className="input mt-1 h-11"
                type="number"
                min="1"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
              />
            </label>
            <button
              onClick={addMoney}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-sigfleet px-4 py-3 font-black text-white"
            >
              <Plus size={17} /> Add ₹{formatMoney(addAmount)} to Wallet
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  )
}
