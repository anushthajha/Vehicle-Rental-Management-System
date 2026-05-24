import React, { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { CreditCard, CheckCircle2, Loader2, Plus, Wallet } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../services/api'
import { formatMoney } from '../../utils/searchData'
import { formatDateTime } from '../../utils/bookingUtils'

export default function PaymentPage() {
  const { bookingId } = useParams()
  const navigate = useNavigate()
  const [booking, setBooking] = useState(null)
  const [wallet, setWallet] = useState({ balance: 0 })
  const [method, setMethod] = useState('simulated')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogState, setDialogState] = useState('confirm')
  const [result, setResult] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addAmount, setAddAmount] = useState(1000)
  const [card, setCard] = useState({ number: '', expiry: '', cvv: '', name: '' })

  async function load() {
    const [bookingResponse, walletResponse] = await Promise.all([
      api.get(`/bookings/${bookingId}`),
      api.get('/payments/wallet'),
    ])
    setBooking(bookingResponse.data)
    setWallet(walletResponse.data)
  }

  useEffect(() => {
    load()
  }, [bookingId])

  const total = Number(booking?.payment?.amount || booking?.total_amount || 0)
  const deficit = Math.max(total - Number(wallet.balance || 0), 0)
  const walletOk = deficit <= 0

  async function addMoney() {
    const response = await api.post('/payments/wallet/add', { amount: Number(addAmount) })
    setWallet((current) => ({ ...current, balance: response.data.new_balance }))
    setAddOpen(false)
  }

  async function confirmPay() {
    setDialogState('processing')
    await new Promise((resolve) => window.setTimeout(resolve, 1500))
    const response = method === 'wallet'
      ? await api.post('/payments/wallet/pay-booking', { booking_id: bookingId })
      : await api.post(`/bookings/${bookingId}/simulate-payment`)
    setResult(response.data)
    sessionStorage.setItem('sigfleet_last_booking_success', JSON.stringify({ ...booking, transaction_id: response.data.transaction_id }))
    setDialogState('success')
  }

  if (!booking) return <main className="grid min-h-screen place-items-center bg-zinc-50"><Loader2 className="animate-spin text-sigfleet" /></main>

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8">
      <section className="mx-auto max-w-3xl space-y-5">
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h1 className="text-3xl font-black text-zinc-950">Complete Payment</h1>
          <div className="mt-4 flex gap-4">
            <img src={booking.car?.primary_image_url || 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=500&q=80'} alt="" className="h-24 w-32 rounded-md object-cover" />
            <div>
              <p className="text-xl font-black text-zinc-950">{booking.car?.title}</p>
              <p className="text-sm font-bold text-zinc-500">{formatDateTime(booking.pickup_datetime)} - {formatDateTime(booking.return_datetime)}</p>
              <p className="mt-2 text-2xl font-black text-sigfleet">₹{formatMoney(total)}</p>
            </div>
          </div>
        </div>

        {booking.payment?.status === 'paid' ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
            <CheckCircle2 className="mx-auto text-emerald-600" size={44} />
            <h2 className="mt-3 text-2xl font-black text-emerald-900">Payment already completed</h2>
            <button onClick={() => navigate(`/booking/success?ref=${booking.booking_ref}`)} className="mt-4 rounded-md bg-sigfleet px-5 py-3 font-black text-white">View Confirmation</button>
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <h2 className="text-xl font-black text-zinc-950">Payment Method</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MethodCard active={method === 'simulated'} onClick={() => setMethod('simulated')} icon={CreditCard} title="Card / UPI / Net Banking" subtitle="Secure simulated payment" />
              <MethodCard active={method === 'wallet'} onClick={() => setMethod('wallet')} icon={Wallet} title="Pay with Wallet" subtitle={`Balance ₹${formatMoney(wallet.balance)}`} />
            </div>
            {method === 'simulated' && <CardFields card={card} setCard={setCard} />}
            {method === 'wallet' && <div className={`mt-4 rounded-md p-3 text-sm font-bold ${walletOk ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{walletOk ? 'Sufficient balance' : <>Deficit ₹{formatMoney(deficit)}. <button onClick={() => setAddOpen(true)} className="underline">Add ₹{formatMoney(deficit)} to wallet</button></>}</div>}
            <button disabled={method === 'wallet' && !walletOk} onClick={() => { setDialogState('confirm'); setDialogOpen(true) }} className="mt-5 w-full rounded-md bg-sigfleet px-5 py-3 font-black text-white disabled:bg-zinc-300">Pay ₹{formatMoney(total)}</button>
          </div>
        )}
      </section>

      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-2xl">
            <Dialog.Title className="text-2xl font-black text-zinc-950">{dialogState === 'success' ? 'Payment Successful!' : 'Confirm Payment'}</Dialog.Title>
            {dialogState === 'confirm' && <div className="mt-4 space-y-2 font-bold text-zinc-700"><p>Amount: ₹{formatMoney(total)}</p><p>Booking: {booking.booking_ref}</p><p>Car: {booking.car?.title}</p><p>Method: {method === 'wallet' ? 'Wallet' : 'Simulated Card Payment'}</p><p className="text-sm text-zinc-500">(Safe demo environment)</p><div className="mt-5 flex justify-end gap-3"><button onClick={() => setDialogOpen(false)} className="rounded-md border border-zinc-300 px-4 py-2 font-black">Cancel</button><button onClick={confirmPay} className="rounded-md bg-sigfleet px-4 py-2 font-black text-white">Confirm & Pay ₹{formatMoney(total)}</button></div></div>}
            {dialogState === 'processing' && <div className="grid min-h-40 place-items-center"><div className="text-center"><Loader2 className="mx-auto animate-spin text-sigfleet" /><p className="mt-3 font-black text-zinc-700">Processing payment...</p></div></div>}
            {dialogState === 'success' && <div className="mt-4 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={56} /><p className="mt-3 font-bold text-zinc-700">Transaction ID: {result?.transaction_id}</p><p className="font-bold text-zinc-700">Amount: ₹{formatMoney(total)} paid</p><button onClick={() => navigate(`/booking/success?ref=${result?.booking_ref || booking.booking_ref}`)} className="mt-5 rounded-md bg-sigfleet px-5 py-3 font-black text-white">View Booking Details</button></div>}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={addOpen} onOpenChange={setAddOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-5">
            <Dialog.Title className="text-xl font-black text-zinc-950">Add Money</Dialog.Title>
            <input className="input mt-4 h-11" type="number" value={addAmount} onChange={(event) => setAddAmount(event.target.value)} />
            <button onClick={addMoney} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-sigfleet px-4 py-3 font-black text-white"><Plus size={17} /> Add to wallet</button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  )
}

function MethodCard({ active, onClick, icon: Icon, title, subtitle }) {
  return <button onClick={onClick} className={`rounded-md border p-4 text-left ${active ? 'border-sigfleet bg-red-50' : 'border-zinc-200'}`}><Icon className="text-sigfleet" /><p className="mt-3 font-black text-zinc-950">{title}</p><p className="mt-1 text-sm font-bold text-zinc-500">{subtitle}</p></button>
}

function CardFields({ card, setCard }) {
  const set = (key, value) => setCard((current) => ({ ...current, [key]: value }))
  const formatted = card.number.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
  return <div className="mt-4 grid gap-3 sm:grid-cols-2"><input className="input h-11 sm:col-span-2" value={formatted} onChange={(event) => set('number', event.target.value)} placeholder="Card number" /><input className="input h-11" value={card.expiry} onChange={(event) => set('expiry', event.target.value)} placeholder="MM/YY" /><input className="input h-11" type="password" value={card.cvv} onChange={(event) => set('cvv', event.target.value)} placeholder="CVV" /><input className="input h-11 sm:col-span-2" value={card.name} onChange={(event) => set('name', event.target.value)} placeholder="Cardholder name" /></div>
}
