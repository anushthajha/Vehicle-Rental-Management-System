import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { X } from 'lucide-react'
import { formatDate, getAdmin, postAdmin } from './adminApi'

const tabs = [
  { key: 'under_review', label: 'Under Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
]
const reasons = ['Documents unclear/blurry', 'DL expired', "Documents don't match", 'Fake documents suspected', 'Incomplete submission', 'Other (specify)']

export default function AdminKYCPage() {
  const [tab, setTab] = useState('under_review')
  const [rows, setRows] = useState([])
  const [active, setActive] = useState(null)
  const [lightbox, setLightbox] = useState(null)

  const load = () => getAdmin('/kyc', { status: tab, limit: 50 }).then((data) => setRows(data.items || []))
  useEffect(load, [tab])

  const approve = async (kyc) => {
    await postAdmin(`/kyc/${kyc.id}/approve`)
    toast.success('KYC approved')
    setActive(null)
    load()
  }
  const reject = async (kyc, reason) => {
    await postAdmin(`/kyc/${kyc.id}/reject`, { reason })
    toast.success('KYC rejected')
    setActive(null)
    load()
  }

  return (
    <div className="space-y-5">
      <div><h2 className="text-2xl font-black">KYC Queue</h2><p className="text-sm font-bold text-zinc-500">Review identity documents oldest first.</p></div>
      <div className="flex gap-2">{tabs.map((item) => <button key={item.key} onClick={() => setTab(item.key)} className={`rounded-md px-4 py-2 text-sm font-black ${tab === item.key ? 'bg-[#E31837] text-white' : 'border border-zinc-200 bg-white'}`}>{item.label}</button>)}</div>
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="p-4">Submitted</th><th className="p-4">User</th><th className="p-4">Email</th><th className="p-4">DL Number</th><th className="p-4">Aadhaar</th><th className="p-4">Status</th><th className="p-4">Actions</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id} onClick={() => setActive(row)} className="cursor-pointer border-t border-zinc-100 hover:bg-zinc-50"><td className="p-4">{formatDate(row.submitted_at)}</td><td className="p-4 font-black">{row.user.full_name}</td><td className="p-4">{row.user.email}</td><td className="p-4">{row.dl_number || '-'}</td><td className="p-4">{row.aadhar_number || '-'}</td><td className="p-4"><Badge value={row.status} /></td><td className="p-4"><button className="rounded-md border border-zinc-200 px-3 py-2 text-xs font-black">Review</button></td></tr>)}</tbody>
        </table>
      </div>
      {active && <ReviewPanel kyc={active} onClose={() => setActive(null)} onApprove={approve} onReject={reject} onImage={setLightbox} />}
      {lightbox && <div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-6" onClick={() => setLightbox(null)}><img alt="" src={lightbox} className="max-h-full max-w-full rounded-md bg-white object-contain" /></div>}
    </div>
  )
}

function Badge({ value }) {
  const styles = value === 'approved' ? 'bg-emerald-50 text-emerald-700' : value === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
  return <span className={`rounded-full px-2 py-1 text-xs font-black capitalize ${styles}`}>{value?.replaceAll('_', ' ')}</span>
}

function ReviewPanel({ kyc, onClose, onApprove, onReject, onImage }) {
  const [reason, setReason] = useState(reasons[0])
  const [other, setOther] = useState('')
  const finalReason = reason === 'Other (specify)' ? other : reason
  const docs = [
    ['DL Front', kyc.dl_front_image],
    ['DL Back', kyc.dl_back_image],
    ['Aadhaar Front', kyc.aadhar_front_image],
    ['Aadhaar Back', kyc.aadhar_back_image],
  ]
  return (
    <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-3xl overflow-y-auto border-l border-zinc-200 bg-white p-6 shadow-2xl">
      <div className="flex items-center justify-between"><h3 className="text-xl font-black">KYC Review</h3><button onClick={onClose} className="rounded-md p-2 hover:bg-zinc-100"><X size={20} /></button></div>
      <section className="mt-5 rounded-lg bg-zinc-50 p-4"><h4 className="font-black">{kyc.user.full_name}</h4><p className="text-sm font-bold text-zinc-500">{kyc.user.email} · {kyc.user.phone || 'No phone'} · Member since {formatDate(kyc.user.created_at)}</p></section>
      <div className="mt-5 grid gap-4 md:grid-cols-2">{docs.map(([label, src]) => <button key={label} onClick={() => src && onImage(src)} className="text-left"><p className="mb-2 text-sm font-black">{label}</p><img alt="" src={src || '/vite.svg'} className="h-56 w-full rounded-md border border-zinc-200 object-contain" /></button>)}</div>
      <div className="mt-5 grid gap-3 md:grid-cols-2"><div className="rounded-md bg-zinc-50 p-3"><p className="text-xs font-black uppercase text-zinc-500">DL Number</p><p className="font-black">{kyc.dl_number}</p></div><div className="rounded-md bg-zinc-50 p-3"><p className="text-xs font-black uppercase text-zinc-500">Aadhaar Number</p><p className="font-black">{kyc.aadhar_number}</p></div></div>
      <div className="mt-5 rounded-lg border border-zinc-200 p-4"><select className="input" value={reason} onChange={(event) => setReason(event.target.value)}>{reasons.map((item) => <option key={item}>{item}</option>)}</select>{reason === 'Other (specify)' && <textarea className="input mt-3 min-h-24" value={other} onChange={(event) => setOther(event.target.value)} />}</div>
      <div className="mt-5 flex gap-3"><button onClick={() => onApprove(kyc)} className="rounded-md bg-emerald-600 px-5 py-3 font-black text-white">Approve</button><button onClick={() => onReject(kyc, finalReason)} disabled={finalReason.length < 3} className="rounded-md bg-[#E31837] px-5 py-3 font-black text-white disabled:opacity-50">Reject</button></div>
    </aside>
  )
}
