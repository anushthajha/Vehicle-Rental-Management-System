import React, { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { BadgeCheck, Camera, CalendarDays, Car, IndianRupee, Loader2, Lock, Star, Trash2, Wallet, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useAuthStore } from '../../context/AuthContext'
import PasswordStrengthMeter from '../auth/PasswordStrengthMeter'
import DashboardShell from './DashboardShell'

export default function ProfilePage() {
  const { setUser, logout } = useAuthStore()
  const fileRef = useRef(null)
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({ full_name: '', phone: '' })
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm_new_password: '' })
  const [prefs, setPrefs] = useState({ booking: true, promos: false, manager: true })
  const [showPassword, setShowPassword] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const response = await api.get('/users/profile')
      setProfile(response.data)
      setForm({ full_name: response.data.user.full_name || '', phone: response.data.user.phone || '' })
      setLoading(false)
    }
    load()
  }, [])

  async function saveProfile(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const response = await api.patch('/users/profile', form)
      setProfile(response.data)
      setUser(response.data.user)
      toast.success('Profile updated')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not update profile')
    } finally {
      setSaving(false)
    }
  }

  async function uploadAvatar(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Please upload a JPG, PNG, or WebP image')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be 2MB or smaller')
      return
    }
    setUploading(true)
    const data = new FormData()
    data.append('avatar', file)
    try {
      const response = await api.post('/users/profile/avatar', data)
      setProfile((current) => ({ ...current, user: response.data.user }))
      setUser(response.data.user)
      toast.success('Profile photo updated')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not upload photo. Please try again.')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  async function deleteAvatar() {
    try {
      const response = await api.delete('/users/profile/avatar')
      setProfile((current) => ({ ...current, user: response.data.user }))
      setUser(response.data.user)
      toast.success('Profile photo removed')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not remove photo')
    }
  }

  async function changePassword(event) {
    event.preventDefault()
    if (passwords.new_password !== passwords.confirm_new_password) {
      toast.error('New passwords do not match')
      return
    }
    try {
      await api.patch('/auth/change-password', passwords)
      toast.success('Password changed. Please log in again.')
      logout()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not change password')
    }
  }

  if (loading) {
    return (
      <DashboardShell title="My Profile" eyebrow="Account">
        <div className="grid h-80 place-items-center"><Loader2 className="animate-spin text-sigfleet" /></div>
      </DashboardShell>
    )
  }

  const user = profile.user
  const kycStatus = profile.kyc_status || 'not_submitted'
  const avatarSrc = user.profile_picture
    ? (user.profile_picture.startsWith('http') ? user.profile_picture : `http://localhost:8000${user.profile_picture}`)
    : null

  return (
    <DashboardShell title="My Profile" eyebrow="Account">
      <div className="space-y-6">

        {/* ── Profile Card ── */}
        <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start gap-6">
            {/* Avatar */}
            <AvatarEditor
              avatarSrc={avatarSrc}
              name={user.full_name}
              uploading={uploading}
              fileRef={fileRef}
              onUpload={uploadAvatar}
              onDelete={deleteAvatar}
            />

            {/* Name + meta */}
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-black text-zinc-950">{user.full_name}</h2>
              <p className="mt-1 font-bold text-zinc-500">{user.email}</p>
              {user.phone && <p className="mt-0.5 font-bold text-zinc-500">+91 {user.phone}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <KycBadge status={kycStatus} />
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-black text-zinc-600 capitalize">
                  {user.role?.replace('_', ' ')}
                </span>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-black text-zinc-600">
                  Member since {new Date(user.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-5 sm:grid-cols-4">
            <StatPill icon={Car} label="Total Trips" value={profile.total_trips_as_customer ?? 0} />
            <StatPill icon={CalendarDays} label="Upcoming" value={profile.upcoming_trips_count ?? 0} />
            <StatPill icon={IndianRupee} label="Total Spent" value={`₹${Number(profile.total_spent || 0).toLocaleString('en-IN')}`} />
            <StatPill icon={Wallet} label="Wallet" value={`₹${Number(profile.wallet_balance || 0).toLocaleString('en-IN')}`} />
          </div>

          {/* KYC prompt if not done */}
          {kycStatus === 'not_submitted' && (
            <div className="mt-5 flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-black text-amber-800">Complete KYC to start booking vehicles</p>
              <Link to="/customer/kyc" className="rounded-md bg-amber-600 px-4 py-2 text-sm font-black text-white hover:bg-amber-700 transition">
                Verify Now →
              </Link>
            </div>
          )}
        </section>

        {/* ── Edit Personal Info ── */}
        <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-zinc-950">Personal Information</h2>
          <form onSubmit={saveProfile} className="mt-5 grid gap-4 lg:grid-cols-2">
            <label className="block">
              <span className="label">Full Name</span>
              <input className="input mt-1 h-11" value={form.full_name} onChange={(e) => setForm((c) => ({ ...c, full_name: e.target.value }))} required />
            </label>
            <label className="block">
              <span className="label">Email <span className="text-zinc-400 font-bold">(cannot be changed)</span></span>
              <input className="input mt-1 h-11 bg-zinc-50 text-zinc-400 cursor-not-allowed" value={user.email} disabled />
            </label>
            <label className="block lg:col-span-2">
              <span className="label">Phone Number</span>
              <div className="mt-1 flex">
                <span className="grid h-11 place-items-center rounded-l-md border border-r-0 border-zinc-300 bg-zinc-100 px-3 font-bold text-zinc-500">+91</span>
                <input
                  className="input h-11 rounded-l-none"
                  value={form.phone}
                  onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                  placeholder="10-digit mobile number"
                />
              </div>
            </label>
            <div className="lg:col-span-2">
              <button disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-md bg-sigfleet px-5 font-black text-white disabled:opacity-60">
                {saving ? <Loader2 className="animate-spin" size={18} /> : null}
                Save Changes
              </button>
            </div>
          </form>
        </section>

        {/* ── Change Password ── */}
        <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-zinc-950">Password</h2>
            <button
              onClick={() => setShowPassword((v) => !v)}
              className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-4 py-2 text-sm font-black text-zinc-700 hover:bg-zinc-50 transition"
            >
              <Lock size={16} /> {showPassword ? 'Hide' : 'Change Password'}
            </button>
          </div>
          {showPassword && (
            <form onSubmit={changePassword} className="mt-5 grid gap-4 lg:grid-cols-2">
              <input
                className="input h-11 lg:col-span-2"
                type="password"
                placeholder="Current password"
                value={passwords.current_password}
                onChange={(e) => setPasswords((c) => ({ ...c, current_password: e.target.value }))}
                required
              />
              <div>
                <input
                  className="input h-11"
                  type="password"
                  placeholder="New password"
                  value={passwords.new_password}
                  onChange={(e) => setPasswords((c) => ({ ...c, new_password: e.target.value }))}
                  required
                />
                <PasswordStrengthMeter password={passwords.new_password} />
              </div>
              <input
                className="input h-11"
                type="password"
                placeholder="Confirm new password"
                value={passwords.confirm_new_password}
                onChange={(e) => setPasswords((c) => ({ ...c, confirm_new_password: e.target.value }))}
                required
              />
              <button className="h-11 rounded-md bg-zinc-950 px-5 font-black text-white lg:col-span-2 w-fit">
                Update Password
              </button>
            </form>
          )}
        </section>

        {/* ── Notification Preferences ── */}
        <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-zinc-950">Notification Preferences</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Pref checked={prefs.booking} onChange={() => setPrefs((c) => ({ ...c, booking: !c.booking }))} label="✉ Booking updates via email" />
            <Pref checked={prefs.promos} onChange={() => setPrefs((c) => ({ ...c, promos: !c.promos }))} label="📢 Promotions and offers" />
            <Pref checked={prefs.manager} onChange={() => setPrefs((c) => ({ ...c, manager: !c.manager }))} label="🏠 Manager activity updates" />
          </div>
        </section>

        {/* ── Danger Zone ── */}
        <section className="rounded-lg border border-red-200 bg-red-50 p-6">
          <h2 className="text-xl font-black text-red-900">Danger Zone</h2>
          <p className="mt-2 text-sm font-bold text-red-700">Permanently delete your account and all associated data. This cannot be undone.</p>
          <Dialog.Root>
            <Dialog.Trigger className="mt-4 inline-flex items-center gap-2 rounded-md bg-red-700 px-4 py-3 font-black text-white hover:bg-red-800 transition">
              <Trash2 size={18} /> Delete Account
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl">
                <div className="flex items-center justify-between gap-4">
                  <Dialog.Title className="text-xl font-black text-zinc-950">Delete Account</Dialog.Title>
                  <Dialog.Close className="text-zinc-500 hover:text-zinc-900"><X /></Dialog.Close>
                </div>
                <p className="mt-3 text-sm font-bold text-zinc-600">This will permanently delete your account, bookings, wallet, and all data. Type <strong>DELETE</strong> to confirm.</p>
                <input
                  className="input mt-4 h-11"
                  value={deleteText}
                  onChange={(e) => setDeleteText(e.target.value)}
                  placeholder="Type DELETE to confirm"
                />
                <button
                  disabled={deleteText !== 'DELETE'}
                  className="mt-4 w-full rounded-md bg-red-700 px-4 py-3 font-black text-white disabled:opacity-40 hover:bg-red-800 transition"
                >
                  Permanently Delete Account
                </button>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </section>

      </div>
    </DashboardShell>
  )
}

function AvatarEditor({ avatarSrc, name, uploading, fileRef, onUpload, onDelete }) {
  const [open, setOpen] = useState(false)
  const wrapRef = React.useRef(null)

  // Close dropdown when clicking outside
  React.useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={wrapRef} className="relative shrink-0">
      {/* Avatar image or initials */}
      {avatarSrc
        ? <img src={avatarSrc} alt={name} className="h-24 w-24 rounded-full object-cover ring-4 ring-zinc-100" />
        : <div className="grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-[#E31837] to-red-700 text-3xl font-black text-white ring-4 ring-zinc-100">{name?.[0]?.toUpperCase()}</div>
      }

      {/* Camera button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={uploading}
        className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full bg-zinc-950 text-white shadow-lg hover:bg-zinc-800 transition disabled:opacity-60"
        aria-label="Edit profile photo"
      >
        {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
      </button>

      {/* Dropdown menu */}
      {open && (
        <div className="absolute bottom-10 right-0 z-30 min-w-[152px] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl">
          <button
            type="button"
            onClick={() => { setOpen(false); fileRef.current?.click() }}
            className="flex w-full items-center gap-2 px-4 py-3 text-sm font-black text-zinc-800 hover:bg-zinc-50 transition"
          >
            <Camera size={14} className="text-zinc-500" />
            {avatarSrc ? 'Change photo' : 'Upload photo'}
          </button>
          {avatarSrc && (
            <button
              type="button"
              onClick={() => { setOpen(false); onDelete() }}
              className="flex w-full items-center gap-2 border-t border-zinc-100 px-4 py-3 text-sm font-black text-red-600 hover:bg-red-50 transition"
            >
              <Trash2 size={14} />
              Remove photo
            </button>
          )}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onUpload} />
    </div>
  )
}

function KycBadge({ status }) {
  if (status === 'approved') return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700"><BadgeCheck size={12} /> KYC Verified</span>
  if (status === 'under_review') return <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">KYC Under Review</span>
  if (status === 'pending') return <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">KYC Pending</span>
  if (status === 'rejected') return <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">KYC Rejected</span>
  return <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">KYC Not Submitted</span>
}

function StatPill({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg bg-zinc-50 p-3 text-center">
      <Icon size={18} className="mx-auto text-sigfleet" />
      <p className="mt-2 text-lg font-black text-zinc-950">{value}</p>
      <p className="text-xs font-bold text-zinc-500">{label}</p>
    </div>
  )
}

function Pref({ checked, onChange, label }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md border border-zinc-200 bg-white p-3 font-bold hover:bg-zinc-50 transition">
      <input type="checkbox" checked={checked} onChange={onChange} className="rounded text-sigfleet focus:ring-sigfleet" />
      {label}
    </label>
  )
}
