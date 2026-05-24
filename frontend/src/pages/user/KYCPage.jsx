import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Clock3, FileText, Loader2, ShieldCheck, Upload, X, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../../services/api'
import DashboardShell from './DashboardShell'

const initialFiles = { dl_front: null, dl_back: null, aadhar_front: null, aadhar_back: null }

export default function KYCPage() {
  const [kyc, setKyc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ dl_number: '', aadhar_number: '' })
  const [files, setFiles] = useState(initialFiles)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { loadStatus() }, [])

  async function loadStatus() {
    setLoading(true)
    const response = await api.get('/kyc/status')
    setKyc(response.data)
    if (response.data.record) {
      setForm({ dl_number: response.data.record.dl_number || '', aadhar_number: response.data.record.aadhar_number || '' })
    }
    setLoading(false)
  }

  async function submit(event) {
    event.preventDefault()
    setSubmitting(true)
    const data = new FormData()
    data.append('dl_number', form.dl_number)
    data.append('aadhar_number', form.aadhar_number)
    Object.entries(files).forEach(([key, file]) => data.append(key, file))
    try {
      const endpoint = kyc?.status === 'rejected' ? '/kyc/resubmit' : '/kyc/submit'
      const response = await api.post(endpoint, data)
      toast.success(response.data.message)
      setFiles(initialFiles)
      await loadStatus()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not submit KYC')
    } finally {
      setSubmitting(false)
    }
  }

  const status = kyc?.status || 'not_submitted'

  return (
    <DashboardShell title="KYC Verification" eyebrow="Identity">
      {loading ? <div className="grid h-80 place-items-center"><Loader2 className="animate-spin text-sigfleet" /></div> : (
        <>
          {(status === 'not_submitted' || status === 'pending') && <KYCForm form={form} setForm={setForm} files={files} setFiles={setFiles} onSubmit={submit} submitting={submitting} />}
          {status === 'under_review' && <UnderReview record={kyc.record} />}
          {status === 'approved' && <Approved record={kyc.record} />}
          {status === 'rejected' && <Rejected record={kyc.record} form={form} setForm={setForm} files={files} setFiles={setFiles} onSubmit={submit} submitting={submitting} />}
        </>
      )}
    </DashboardShell>
  )
}

function KYCForm({ form, setForm, files, setFiles, onSubmit, submitting, rejected = false }) {
  const isComplete = form.dl_number.trim() && cleanDigits(form.aadhar_number).length >= 12 && Object.values(files).every(Boolean)
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-black">{rejected ? 'Resubmit Documents' : 'Verify Your Identity'}</h2>
        <div className="mt-5 grid gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-950 md:grid-cols-3">
          <p>Required to book any car on SigFleet</p>
          <p>Takes 2-3 minutes to submit</p>
          <p>Documents reviewed within 24 hours</p>
        </div>
      </section>

      <DocumentSection title="Driver's License">
        <label className="block md:col-span-2"><span className="label">DL Number</span><input className="input mt-1 h-11" value={form.dl_number} onChange={(event) => setForm((current) => ({ ...current, dl_number: event.target.value }))} placeholder="e.g. DL-0420110012345" /></label>
        <FileUpload label="Front side" file={files.dl_front} onFile={(file) => setFiles((current) => ({ ...current, dl_front: file }))} />
        <FileUpload label="Back side" file={files.dl_back} onFile={(file) => setFiles((current) => ({ ...current, dl_back: file }))} />
      </DocumentSection>

      <DocumentSection title="Aadhaar Card">
        <label className="block md:col-span-2"><span className="label">Aadhaar Number</span><input className="input mt-1 h-11" value={maskedAadhaar(form.aadhar_number)} onChange={(event) => setForm((current) => ({ ...current, aadhar_number: cleanDigits(event.target.value).slice(0, 12) }))} placeholder="12-digit Aadhaar number" /></label>
        <FileUpload label="Front side" file={files.aadhar_front} onFile={(file) => setFiles((current) => ({ ...current, aadhar_front: file }))} />
        <FileUpload label="Back side" file={files.aadhar_back} onFile={(file) => setFiles((current) => ({ ...current, aadhar_back: file }))} />
      </DocumentSection>

      <button disabled={!isComplete || submitting} className="inline-flex h-12 items-center rounded-md bg-sigfleet px-6 font-black text-white disabled:opacity-50">
        {submitting ? <Loader2 className="animate-spin" size={20} /> : 'Submit KYC'}
      </button>
    </form>
  )
}

function DocumentSection({ title, children }) {
  return <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"><h3 className="text-xl font-black">{title}</h3><div className="mt-5 grid gap-4 md:grid-cols-2">{children}</div></section>
}

function FileUpload({ label, file, onFile }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const preview = useMemo(() => (file && file.type.startsWith('image/') ? URL.createObjectURL(file) : null), [file])

  function pick(nextFile) {
    if (!nextFile) return
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(nextFile.type)) {
      toast.error('Accepted formats: JPG, PNG, PDF')
      return
    }
    if (nextFile.size > 5 * 1024 * 1024) {
      toast.error('Max file size is 5MB')
      return
    }
    onFile(nextFile)
  }

  return (
    <div>
      <p className="label mb-1">{label}</p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files?.[0]) }}
        className={`grid min-h-44 w-full place-items-center rounded-lg border-2 border-dashed p-4 text-center transition ${dragging ? 'border-sigfleet bg-red-50' : 'border-zinc-300 bg-zinc-50'}`}
      >
        {file ? (
          <div className="w-full">
            {preview ? <img src={preview} alt="" className="mx-auto h-28 w-full rounded-md object-cover" /> : <FileText className="mx-auto text-sigfleet" size={42} />}
            <p className="mt-2 truncate text-sm font-black">{file.name}</p>
            <span onClick={(event) => { event.stopPropagation(); onFile(null) }} className="mt-2 inline-flex items-center gap-1 rounded-md bg-white px-3 py-2 text-sm font-black text-red-700 shadow-sm"><X size={16} /> Remove</span>
          </div>
        ) : (
          <div>
            <Upload className="mx-auto text-zinc-400" />
            <p className="mt-2 font-black text-zinc-700">Drag or click to upload</p>
            <p className="mt-1 text-xs font-bold text-zinc-500">JPG, PNG, PDF · Max 5MB</p>
          </div>
        )}
      </button>
      <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,application/pdf" onChange={(event) => pick(event.target.files?.[0])} />
    </div>
  )
}

function UnderReview({ record }) {
  return <StatusCard icon={Clock3} tone="text-blue-700 bg-blue-50" title="Documents Under Review" body="Expected: Within 24 hours" record={record} info="We'll send you an email and notification once verified." />
}

function Approved({ record }) {
  return <StatusCard icon={CheckCircle2} tone="text-emerald-700 bg-emerald-50" title="KYC Verified ✓" body="You're fully verified and can book any car on SigFleet!" record={record} cta={<Link to="/vehicles" className="mt-5 inline-flex rounded-md bg-sigfleet px-5 py-3 font-black text-white">Book a Vehicle</Link>} />
}

function Rejected({ record, form, setForm, files, setFiles, onSubmit, submitting }) {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-red-50 text-red-700"><XCircle size={44} /></div>
        <h2 className="mt-4 text-2xl font-black">Verification Failed</h2>
        <div className="mx-auto mt-4 max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-4 font-bold text-amber-900">{record?.rejection_reason || 'Please resubmit clearer documents.'}</div>
        <p className="mt-4 font-bold text-zinc-600">Make sure all documents are clearly visible, uncropped, and match your profile details.</p>
      </section>
      <KYCForm rejected form={form} setForm={setForm} files={files} setFiles={setFiles} onSubmit={onSubmit} submitting={submitting} />
    </div>
  )
}

function StatusCard({ icon: Icon, tone, title, body, record, info, cta }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
      <div className={`mx-auto grid h-24 w-24 place-items-center rounded-full ${tone}`}><Icon size={48} /></div>
      <h2 className="mt-5 text-3xl font-black">{title}</h2>
      <p className="mt-3 font-bold text-zinc-600">{body}</p>
      <div className="mx-auto mt-5 grid max-w-xl gap-2 rounded-lg bg-zinc-50 p-4 text-sm font-bold text-zinc-600 sm:grid-cols-2">
        <p>Submitted: {formatDate(record?.submitted_at)}</p>
        <p>Approved: {formatDate(record?.reviewed_at)}</p>
        <p>DL ending in {lastFour(record?.dl_number)}</p>
        <p>Aadhaar ending in {lastFour(record?.aadhar_number)}</p>
      </div>
      {info && <div className="mx-auto mt-5 max-w-xl rounded-lg border border-amber-200 bg-amber-50 p-4 font-bold text-amber-900">{info}</div>}
      {cta}
    </section>
  )
}

function cleanDigits(value) {
  return (value || '').replace(/\D/g, '')
}

function maskedAadhaar(value) {
  const digits = cleanDigits(value)
  if (digits.length < 12) return digits
  return `XXXX-XXXX-${digits.slice(-4)}`
}

function lastFour(value) {
  return cleanDigits(value).slice(-4) || '----'
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : 'Pending'
}
