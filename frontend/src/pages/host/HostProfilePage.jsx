import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { CheckCircle2, Trophy } from 'lucide-react'
import { dateLabel, getHost, patchHost } from './hostApi'

export default function HostProfilePage() {
  const [data, setData] = useState(null)
  const [form, setForm] = useState({ bio: '', response_time: 'Within a few hours' })
  const [prefs, setPrefs] = useState({ requests: true, messages: true, payouts: true, announcements: true })
  useEffect(() => {
    getHost('/profile').then((response) => {
      setData(response)
      setForm({ bio: response.profile.bio || '', response_time: response.profile.response_time || 'Within a few hours' })
    })
  }, [])
  const save = async () => {
    await patchHost('/profile', form)
    toast.success('Host profile saved')
  }
  if (!data) return <div className="grid min-h-screen place-items-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-zoomcar" /></div>
  const { profile, stats, verification } = data
  return <div className="px-4 py-8"><section className="mx-auto max-w-5xl space-y-6"><div><p className="text-sm font-black uppercase text-zoomcar">Host Profile</p><h1 className="text-3xl font-black">Public hosting profile</h1></div>
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">Host Stats</h2><p className="text-sm font-bold text-zinc-500">Member since {dateLabel(profile.joined_as_host_at)}</p></div>{profile.is_superhost && <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-sm font-black text-amber-800"><Trophy size={16} /> Superhost</span>}</div><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><Stat label="Rating" value={`${profile.average_rating} ★`} /><Stat label="Reviews" value={profile.total_reviews} /><Stat label="Total Trips" value={stats.total_trips_completed} /><Stat label="Acceptance" value={`${profile.acceptance_rate}%`} /><Stat label="Listings" value={profile.total_listings} /></div></section>
    <section className="grid gap-5 lg:grid-cols-2"><div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"><h2 className="font-black">Bio</h2><textarea className="input mt-3 min-h-40" maxLength={500} value={form.bio} onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))} /><p className="mt-1 text-right text-xs font-bold text-zinc-500">{form.bio.length}/500</p><label className="label mt-4 block">Response time<select className="input mt-1" value={form.response_time} onChange={(event) => setForm((current) => ({ ...current, response_time: event.target.value }))}><option>Within 1 hour</option><option>Within a few hours</option><option>Within a day</option></select></label><button onClick={save} className="mt-5 rounded-md bg-zoomcar px-4 py-3 font-black text-white">Save Profile</button></div><div className="space-y-5"><div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"><h2 className="font-black">Notification Preferences</h2><div className="mt-4 space-y-3">{[['requests', 'New booking requests'], ['messages', 'Guest messages'], ['payouts', 'Payout updates'], ['announcements', 'Platform announcements']].map(([key, label]) => <label key={key} className="flex items-center justify-between rounded-md bg-zinc-50 p-3 font-bold"><span>{label}</span><input type="checkbox" checked={prefs[key]} onChange={(event) => setPrefs((current) => ({ ...current, [key]: event.target.checked }))} /></label>)}</div></div><div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"><h2 className="font-black">Verification Status</h2><div className="mt-4 space-y-3"><Verify label="KYC" ok={verification.kyc} /><Verify label="Phone" ok={verification.phone} /><Verify label="Bank Account" ok={verification.bank_account} /></div></div></div></section>
  </section></div>
}

function Stat({ label, value }) {
  return <div className="rounded-md bg-zinc-50 p-4"><p className="text-xs font-black uppercase text-zinc-500">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>
}

function Verify({ label, ok }) {
  return <div className="flex items-center justify-between rounded-md bg-zinc-50 p-3"><span className="font-black">{label}</span><span className={`inline-flex items-center gap-1 text-sm font-black ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>{ok ? <CheckCircle2 size={16} /> : null}{ok ? 'Verified' : label === 'Bank Account' ? 'Add account for payouts' : 'Prompt required'}</span></div>
}
