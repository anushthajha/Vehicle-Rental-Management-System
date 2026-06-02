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
    try {
      const response = await api.get('/kyc/status')
      setKyc(response.data)
      if (response.data.record) {
        setForm({ dl_number: response.data.record.dl_number || '', aadhar_number: response.data.record.aadhar_number || '' })
      }
    } catch (err) {
      const status = err?.response?.status || err?.status
      if (status === 404) {
        // No KYC record yet — normal for new users
        setKyc({ status: 'not_submitted', record: null })
      } else if (status === 401) {
        // Token not ready yet (navigating back) — retry once after a short delay
        setTimeout(() => loadStatus(), 800)
        return
      } else {
        // Only show error for genuine server errors
        setKyc({ status: 'not_submitted', record: null })
        toast.error('Could not load KYC status. Please try again.')
      }
    } finally {
      setLoading(false)
    }
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
      toast.success(response.data?.message || 'KYC submitted successfully.')
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
  const [fieldErrors, setFieldErrors] = useState({})

  function validateForm() {
    const errors = {}
    if (!form.dl_number.trim() || form.dl_number.trim().length < 8) {
      errors.dl_number = 'Driving licence number must be at least 8 characters'
    }
    const digits = cleanDigits(form.aadhar_number)
    if (digits.length !== 12) {
      errors.aadhar_number = 'Aadhaar number must be exactly 12 digits'
    }
    if (!files.dl_front) errors.dl_front = 'DL front image is required'
    if (!files.dl_back) errors.dl_back = 'DL back image is required'
    if (!files.aadhar_front) errors.aadhar_front = 'Aadhaar front image is required'
    if (!files.aadhar_back) errors.aadhar_back = 'Aadhaar back image is required'
    return errors
  }

  function handleSubmit(event) {
    event.preventDefault()
    const errors = validateForm()
    if (Object.keys(errors).length) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
    onSubmit(event)
  }

  const isComplete = form.dl_number.trim().length >= 8
    && cleanDigits(form.aadhar_number).length === 12
    && Object.values(files).every(Boolean)

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-black">{rejected ? 'Resubmit Documents' : 'Verify Your Identity'}</h2>
        <div className="mt-5 grid gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-950 md:grid-cols-3">
          <p>Required to book any car on SigFleet</p>
          <p>Takes 2-3 minutes to submit</p>
          <p>Documents reviewed within 24 hours</p>
        </div>
      </section>

      <DocumentSection title="Driver's License">
        <div className="md:col-span-2">
          <label className="block">
            <span className="label">DL Number</span>
            <input
              className={`input mt-1 h-11 ${fieldErrors.dl_number ? 'border-red-500 bg-red-50' : ''}`}
              value={form.dl_number}
              onChange={(event) => {
                setForm((current) => ({ ...current, dl_number: event.target.value }))
                if (fieldErrors.dl_number) setFieldErrors((e) => ({ ...e, dl_number: undefined }))
              }}
              onBlur={() => {
                if (form.dl_number.trim().length > 0 && form.dl_number.trim().length < 8) {
                  setFieldErrors((e) => ({ ...e, dl_number: 'DL number must be at least 8 characters' }))
                }
              }}
              placeholder="e.g. DL-0420110012345"
            />
            {fieldErrors.dl_number && (
              <span className="mt-1 block text-xs font-bold text-red-600">{fieldErrors.dl_number}</span>
            )}
          </label>
        </div>
        <div>
          <FileUpload label="Front side *" file={files.dl_front} onFile={(file) => { setFiles((current) => ({ ...current, dl_front: file })); setFieldErrors((e) => ({ ...e, dl_front: undefined })) }} />
          {fieldErrors.dl_front && <span className="mt-1 block text-xs font-bold text-red-600">{fieldErrors.dl_front}</span>}
        </div>
        <div>
          <FileUpload label="Back side *" file={files.dl_back} onFile={(file) => { setFiles((current) => ({ ...current, dl_back: file })); setFieldErrors((e) => ({ ...e, dl_back: undefined })) }} />
          {fieldErrors.dl_back && <span className="mt-1 block text-xs font-bold text-red-600">{fieldErrors.dl_back}</span>}
        </div>
      </DocumentSection>

      <DocumentSection title="Aadhaar Card">
        <div className="md:col-span-2">
          <label className="block">
            <span className="label">Aadhaar Number</span>
            <input
              className={`input mt-1 h-11 ${fieldErrors.aadhar_number ? 'border-red-500 bg-red-50' : ''}`}
              value={maskedAadhaar(form.aadhar_number)}
              onChange={(event) => {
                setForm((current) => ({ ...current, aadhar_number: cleanDigits(event.target.value).slice(0, 12) }))
                if (fieldErrors.aadhar_number) setFieldErrors((e) => ({ ...e, aadhar_number: undefined }))
              }}
              onBlur={() => {
                const digits = cleanDigits(form.aadhar_number)
                if (digits.length > 0 && digits.length !== 12) {
                  setFieldErrors((e) => ({ ...e, aadhar_number: 'Aadhaar number must be exactly 12 digits' }))
                }
              }}
              placeholder="12-digit Aadhaar number"
            />
            {fieldErrors.aadhar_number && (
              <span className="mt-1 block text-xs font-bold text-red-600">{fieldErrors.aadhar_number}</span>
            )}
          </label>
        </div>
        <div>
          <FileUpload label="Front side *" file={files.aadhar_front} onFile={(file) => { setFiles((current) => ({ ...current, aadhar_front: file })); setFieldErrors((e) => ({ ...e, aadhar_front: undefined })) }} />
          {fieldErrors.aadhar_front && <span className="mt-1 block text-xs font-bold text-red-600">{fieldErrors.aadhar_front}</span>}
        </div>
        <div>
          <FileUpload label="Back side *" file={files.aadhar_back} onFile={(file) => { setFiles((current) => ({ ...current, aadhar_back: file })); setFieldErrors((e) => ({ ...e, aadhar_back: undefined })) }} />
          {fieldErrors.aadhar_back && <span className="mt-1 block text-xs font-bold text-red-600">{fieldErrors.aadhar_back}</span>}
        </div>
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
