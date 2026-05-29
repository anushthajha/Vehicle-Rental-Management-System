import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ImagePlus, Loader2, ShieldAlert, XCircle } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { bookingDuration, formatDateTime, moneyLabel } from '../../utils/bookingUtils'

const CONDITIONS = [
  { value: 'good', label: 'Good Condition', detail: 'No penalty', penalty: 0, icon: CheckCircle2 },
  { value: 'minor_damage', label: 'Minor Damage', detail: 'Scratches, small dents, minor interior stains', penalty: 2000, icon: AlertTriangle },
  { value: 'major_damage', label: 'Major Damage', detail: 'Broken parts, large dents, significant damage', penalty: 10000, icon: ShieldAlert },
  { value: 'total_loss', label: 'Total Loss', detail: 'Vehicle undriveable or accident damage', penalty: 50000, icon: XCircle },
]

export default function InspectionPage() {
  const { bookingId } = useParams()
  const navigate = useNavigate()
  const [booking, setBooking] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [condition, setCondition] = useState('good')
  const [damageNotes, setDamageNotes] = useState('')
  const [imagePreviews, setImagePreviews] = useState([])
  const [overridePenalty, setOverridePenalty] = useState(false)
  const [customPenalty, setCustomPenalty] = useState('')
  const [penaltyReason, setPenaltyReason] = useState('')

  useEffect(() => {
    let mounted = true
    setLoading(true)
    api.get(`/bookings/${bookingId}`)
      .then((response) => {
        if (mounted) setBooking(response.data)
      })
      .catch(() => toast.error('Unable to load booking.'))
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
      imagePreviews.forEach((item) => URL.revokeObjectURL(item.url))
    }
  }, [bookingId])

  const selected = CONDITIONS.find((item) => item.value === condition) || CONDITIONS[0]
  const penalty = useMemo(() => {
    if (!overridePenalty) return selected.penalty
    return Math.max(Number(customPenalty || 0), 0)
  }, [customPenalty, overridePenalty, selected.penalty])

  function onFiles(event) {
    const files = Array.from(event.target.files || [])
    setImagePreviews((prev) => [
      ...prev,
      ...files.map((file) => ({ name: file.name, url: URL.createObjectURL(file) })),
    ])
  }

  async function submit(event) {
    event.preventDefault()
    if (condition !== 'good' && !damageNotes.trim()) {
      toast.error('Damage notes are required.')
      return
    }
    if (overridePenalty && !penaltyReason.trim()) {
      toast.error('Please add a reason for the penalty override.')
      return
    }
    setSaving(true)
    try {
      const response = await api.post('/inspections', {
        booking_id: bookingId,
        condition,
        damage_notes: damageNotes,
        damage_images: imagePreviews.map((image) => image.name),
        custom_penalty_amount: overridePenalty ? penalty : null,
        penalty_reason: overridePenalty ? penaltyReason : null,
      })
      const inspection = response.data?.inspection || response.data
      const amount = Number(inspection?.penalty_amount || 0)
      toast.success(amount > 0 ? `Inspection recorded. ${moneyLabel(amount)} penalty ${response.data?.penalty_charged ? 'charged' : 'recorded'}.` : 'Inspection recorded. Booking closed.')
      navigate('/manager/bookings', { replace: true })
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Inspection could not be recorded.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <main className="grid min-h-[500px] place-items-center"><Loader2 className="animate-spin text-sigfleet" /></main>
  }

  if (!booking) {
    return <main className="p-8 text-center font-black text-zinc-500">Booking not found.</main>
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8">
      <form onSubmit={submit} className="mx-auto max-w-5xl space-y-5">
        <div>
          <p className="text-sm font-black uppercase text-sigfleet">Return Inspection</p>
          <h1 className="text-3xl font-black text-zinc-950">Complete Inspection & Close Booking</h1>
        </div>

        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-xl font-black text-zinc-950">{booking.car?.title}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Booking" value={booking.booking_ref} />
            <Info label="Customer" value={booking.counterparty?.name || 'Customer'} />
            <Info label="Dates" value={`${formatDateTime(booking.pickup_datetime)} - ${formatDateTime(booking.return_datetime)}`} />
            <Info label="Duration" value={bookingDuration(booking)} />
          </div>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-xl font-black text-zinc-950">Condition</h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {CONDITIONS.map((item) => {
              const Icon = item.icon
              const active = condition === item.value
              return (
                <button
                  type="button"
                  key={item.value}
                  onClick={() => setCondition(item.value)}
                  className={`flex items-start gap-3 rounded-lg border p-4 text-left transition ${active ? 'border-sigfleet bg-red-50 text-sigfleet' : 'border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300'}`}
                >
                  <Icon size={22} className="mt-0.5 shrink-0" />
                  <span>
                    <span className="block font-black">{item.label} {item.penalty ? `- ${moneyLabel(item.penalty)}` : ''}</span>
                    <span className="mt-1 block text-sm font-bold text-zinc-500">{item.detail}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-xl font-black text-zinc-950">Damage Evidence</h2>
          <textarea className="input mt-4 min-h-28" value={damageNotes} onChange={(event) => setDamageNotes(event.target.value)} placeholder={condition === 'good' ? 'Optional inspection notes' : 'Describe the damage in detail'} />
          <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center font-black text-zinc-600 hover:border-sigfleet hover:text-sigfleet">
            <ImagePlus size={24} />
            <span className="mt-2">Upload damage images</span>
            <input type="file" multiple accept="image/*" onChange={onFiles} className="hidden" />
          </label>
          {imagePreviews.length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {imagePreviews.map((image) => <img key={image.url} src={image.url} alt={image.name} className="h-32 w-full rounded-md object-cover" />)}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <label className="flex items-center gap-3 font-black text-zinc-900">
            <input type="checkbox" checked={overridePenalty} onChange={(event) => setOverridePenalty(event.target.checked)} />
            Override calculated penalty
          </label>
          {overridePenalty && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input className="input h-11" type="number" min="0" value={customPenalty} onChange={(event) => setCustomPenalty(event.target.value)} placeholder="Custom penalty amount" />
              <input className="input h-11" value={penaltyReason} onChange={(event) => setPenaltyReason(event.target.value)} placeholder="Reason for override" />
            </div>
          )}
          <div className="mt-4 rounded-lg bg-zinc-950 p-4 text-white">
            <p className="text-sm font-bold text-zinc-300">Penalty to be charged</p>
            <p className="text-3xl font-black">{moneyLabel(penalty)}</p>
            <p className="mt-1 text-sm font-bold text-zinc-400">It will be deducted from the customer wallet when funds are available, otherwise recorded for payment.</p>
          </div>
        </section>

        <div className="flex justify-end">
          <button disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-sigfleet px-5 py-3 font-black text-white disabled:opacity-60">
            {saving && <Loader2 size={18} className="animate-spin" />}
            Complete Inspection & Close Booking
          </button>
        </div>
      </form>
    </main>
  )
}

function Info({ label, value }) {
  return <div className="rounded-md bg-zinc-50 p-3"><p className="text-xs font-black uppercase text-zinc-500">{label}</p><p className="mt-1 font-bold text-zinc-900">{value || '-'}</p></div>
}
