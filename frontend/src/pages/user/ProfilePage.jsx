import React, { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Camera, Loader2, Lock, Trash2, X } from 'lucide-react'
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
  const [prefs, setPrefs] = useState({ booking: true, promos: false, host: true })
  const [showPassword, setShowPassword] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [saving, setSaving] = useState(false)
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
    const data = new FormData()
    data.append('avatar', file)
    try {
      const response = await api.post('/users/profile/avatar', data)
      setProfile((current) => ({ ...current, user: response.data.user }))
      setUser(response.data.user)
      toast.success('Photo updated')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not upload photo')
    } finally {
      event.target.value = ''
    }
  }

  async function changePassword(event) {
    event.preventDefault()
    try {
      await api.patch('/auth/change-password', passwords)
      toast.success('Password changed. Please log in again.')
      logout()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not change password')
    }
  }

  return (
    <DashboardShell title="Settings" eyebrow="Account">
      {loading ? <div className="grid h-80 place-items-center"><Loader2 className="animate-spin text-sigfleet" /></div> : (
        <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
          <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="relative mx-auto h-32 w-32">
              {profile.user.profile_picture ? <img src={profile.user.profile_picture} alt="" className="h-32 w-32 rounded-full object-cover" /> : <div className="grid h-32 w-32 place-items-center rounded-full bg-zinc-100 text-4xl font-black text-zinc-500">{profile.user.full_name?.[0]}</div>}
              <button type="button" onClick={() => fileRef.current?.click()} className="absolute bottom-1 right-1 grid h-11 w-11 place-items-center rounded-full bg-sigfleet text-white shadow-lg" aria-label="Upload profile photo"><Camera size={20} /></button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={uploadAvatar} />
            </div>
            <div className="mt-5 text-center">
              <h2 className="text-xl font-black">{profile.user.full_name}</h2>
              <p className="mt-1 text-sm font-bold text-zinc-500">{profile.user.email}</p>
            </div>
          </section>

          <div className="space-y-6">
            <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">Personal Info</h2>
              <form onSubmit={saveProfile} className="mt-5 grid gap-4 lg:grid-cols-2">
                <label className="block"><span className="label">Full Name</span><input className="input mt-1 h-11" value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} required /></label>
                <label className="block"><span className="label">Email</span><input className="input mt-1 h-11 bg-zinc-100 text-zinc-500" value={profile.user.email} disabled /></label>
                <label className="block lg:col-span-2"><span className="label">Phone</span><div className="mt-1 flex"><span className="grid h-11 place-items-center rounded-l-md border border-r-0 border-zinc-300 bg-zinc-100 px-3 font-bold text-zinc-500">+91</span><input className="input h-11 rounded-l-none" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} /></div></label>
                <div className="lg:col-span-2"><button disabled={saving} className="inline-flex h-11 items-center rounded-md bg-sigfleet px-5 font-black text-white disabled:opacity-60">{saving ? <Loader2 className="animate-spin" size={18} /> : 'Save Changes'}</button></div>
              </form>
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
              <button onClick={() => setShowPassword((value) => !value)} className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-4 py-3 font-black"><Lock size={18} /> Change Password</button>
              {showPassword && (
                <form onSubmit={changePassword} className="mt-5 grid gap-4 lg:grid-cols-2">
                  <input className="input h-11 lg:col-span-2" type="password" placeholder="Current password" value={passwords.current_password} onChange={(event) => setPasswords((current) => ({ ...current, current_password: event.target.value }))} required />
                  <div><input className="input h-11" type="password" placeholder="New password" value={passwords.new_password} onChange={(event) => setPasswords((current) => ({ ...current, new_password: event.target.value }))} required /><PasswordStrengthMeter password={passwords.new_password} /></div>
                  <input className="input h-11" type="password" placeholder="Confirm new password" value={passwords.confirm_new_password} onChange={(event) => setPasswords((current) => ({ ...current, confirm_new_password: event.target.value }))} required />
                  <button className="h-11 rounded-md bg-zinc-950 px-5 font-black text-white">Update Password</button>
                </form>
              )}
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">Notification Preferences</h2>
              <div className="mt-4 grid gap-3">
                <Pref checked={prefs.booking} onChange={() => setPrefs((current) => ({ ...current, booking: !current.booking }))} label="✉ Booking updates via email" />
                <Pref checked={prefs.promos} onChange={() => setPrefs((current) => ({ ...current, promos: !current.promos }))} label="📢 Promotions and offers" />
                <Pref checked={prefs.host} onChange={() => setPrefs((current) => ({ ...current, host: !current.host }))} label="🏠 Host activity updates" />
              </div>
            </section>

            <section className="rounded-lg border border-red-200 bg-red-50 p-6">
              <h2 className="text-xl font-black text-red-900">Danger Zone</h2>
              <Dialog.Root>
                <Dialog.Trigger className="mt-4 inline-flex items-center gap-2 rounded-md bg-red-700 px-4 py-3 font-black text-white"><Trash2 size={18} /> Delete Account</Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
                  <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl">
                    <div className="flex items-center justify-between gap-4"><Dialog.Title className="text-xl font-black">Delete Account</Dialog.Title><Dialog.Close className="text-zinc-500"><X /></Dialog.Close></div>
                    <p className="mt-3 text-zinc-600">This action is irreversible. Type DELETE to confirm.</p>
                    <input className="input mt-4 h-11" value={deleteText} onChange={(event) => setDeleteText(event.target.value)} />
                    <button disabled={deleteText !== 'DELETE'} className="mt-4 w-full rounded-md bg-red-700 px-4 py-3 font-black text-white disabled:opacity-40">Confirm Delete</button>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </section>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}

function Pref({ checked, onChange, label }) {
  return <label className="flex items-center gap-3 rounded-md border border-zinc-200 p-3 font-bold"><input type="checkbox" checked={checked} onChange={onChange} className="rounded text-sigfleet focus:ring-sigfleet" />{label}</label>
}
