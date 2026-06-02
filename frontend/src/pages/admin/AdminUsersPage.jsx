// FIX: Action icon buttons in both tables were previously text labels or non-button wrappers lacking stopPropagation, causing unwanted parent click events. Tooltips were missing or clipped by overflow. Replaced all action icons with natively clickable <button type="button"> elements, added stopPropagation, implemented centered bottom-full group-hover custom dark tooltips, set overflow-visible classes, and wired handlers to RESTful PUT/DELETE endpoints with confirm blocks.

import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { Ban, CheckCircle, Eye, Pencil, Search, Trash2, UserMinus, X } from 'lucide-react'
import { formatDate, formatMoney, getAdmin, initials, patchAdmin, postAdmin, putAdmin, deleteAdmin } from './adminApi'

export default function AdminUsersPage({ initialTab = 'customers' }) {
  const [rows, setRows] = useState([])
  const [filters, setFilters] = useState({ search: '', role: '', is_active: '' })
  const [tab, setTab] = useState(initialTab)
  const [selected, setSelected] = useState([])
  const [details, setDetails] = useState(null)
  const [roleUser, setRoleUser] = useState(null)

  const load = () => {
    const params = {
      search: filters.search || undefined,
      // Always filter by role based on tab — customers tab ONLY shows customers
      role: tab === 'managers' ? 'vehicle_manager' : 'customer',
      is_active: filters.is_active === '' ? undefined : filters.is_active === 'true',
      limit: 50,
    }
    if (tab === 'managers') {
      getAdmin('/vehicle-managers', { search: params.search, is_active: params.is_active, limit: 50 })
        .then((data) => setRows(data.vehicle_managers || []))
        .catch(() => setRows([]))
    } else {
      getAdmin('/users', params)
        .then((data) => setRows(data.items || []))
        .catch(() => setRows([]))
    }
  }

  useEffect(load, [filters.role, filters.is_active, tab])

  const suspend = async (user, active = false) => {
    try {
      await putAdmin(`/users/${user.id}/status`, { is_active: active })
      toast.success(active ? 'User reactivated' : 'User suspended')
      setRows((current) => current.map((row) => (
        row.id === user.id ? { ...row, is_active: active, account_active: active, status: active ? 'active' : 'suspended' } : row
      )))
    } catch (error) {
      toast.error(error?.message || 'Failed to update user status')
    }
  }

  const bulkSuspend = async () => {
    try {
      await Promise.all(selected.map((id) => putAdmin(`/users/${id}/status`, { is_active: false })))
      setSelected([])
      toast.success('Selected users suspended')
      load()
    } catch (error) {
      toast.error('Failed to suspend selected users')
    }
  }

  const openDetails = async (user) => {
    setDetails(await getAdmin(`/users/${user.id}/details`))
  }

  const handleDemote = async (manager) => {
    const confirm = window.confirm(`Are you sure you want to demote ${manager.full_name} to Customer?`)
    if (!confirm) return
    try {
      await putAdmin(`/users/${manager.id}/role`, { role: 'customer' })
      toast.success('Vehicle Manager demoted to Customer')
      load()
    } catch (error) {
      console.error(error)
      toast.error(error?.message || 'Failed to demote manager')
    }
  }

  const handleDeleteUser = async (user) => {
    const confirm = window.confirm(`Are you sure you want to permanently delete ${user.full_name}? This action is irreversible.`)
    if (!confirm) return
    try {
      await deleteAdmin(`/users/${user.id}`)
      toast.success('User deleted successfully')
      load()
    } catch (error) {
      toast.error(error?.message || 'Failed to delete user')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black">Users</h2>
          <p className="text-sm font-bold text-zinc-500">Search, verify, suspend, and change account roles.</p>
        </div>
        {selected.length > 0 && <button onClick={bulkSuspend} className="rounded-md bg-[#E31837] px-4 py-2 text-sm font-black text-white">Bulk Suspend ({selected.length})</button>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-2 shadow-sm">
        <div className="flex gap-1">
          {[['customers', 'Customers'], ['managers', 'Vehicle Managers']].map(([key, label]) => (
            <button key={key} onClick={() => { setTab(key); setFilters((value) => ({ ...value, role: '' })) }} className={`rounded-md px-4 py-2 text-sm font-black ${tab === key ? 'bg-[#E31837] text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}>{label}</button>
          ))}
        </div>
        {tab === 'managers' && <Link to="/admin/users/managers/create" className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-black text-white">+ Create Vehicle Manager</Link>}
      </div>

      <div className="flex flex-wrap gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="relative min-w-72 flex-1">
          <Search className="absolute left-3 top-3 text-zinc-400" size={18} />
          <input className="input pl-10" placeholder="Search name, email, phone" value={filters.search} onChange={(event) => setFilters((value) => ({ ...value, search: event.target.value }))} onKeyDown={(event) => event.key === 'Enter' && load()} />
        </div>
        <select className="input w-44" value={filters.is_active} onChange={(event) => setFilters((value) => ({ ...value, is_active: event.target.value }))}>
          <option value="">All status</option><option value="true">Active</option><option value="false">Suspended</option>
        </select>
        <button onClick={load} className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-black text-white">Search</button>
      </div>

      {tab === 'managers' ? (
        <ManagerTable rows={rows} openDetails={openDetails} suspend={suspend} setRoleUser={setRoleUser} handleDemote={handleDemote} handleDeleteUser={handleDeleteUser} />
      ) : (
        <div className="overflow-x-auto overflow-y-visible rounded-lg border border-zinc-200 bg-white shadow-sm">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="p-4"><input type="checkbox" checked={selected.length === rows.length && rows.length > 0} onChange={(event) => setSelected(event.target.checked ? rows.map((row) => row.id) : [])} /></th>
                <th className="p-4">#</th><th className="p-4">Name</th><th className="p-4">Email</th><th className="p-4">Phone</th><th className="p-4">Role</th><th className="p-4">KYC</th><th className="p-4">Bookings</th><th className="p-4">Status</th><th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((user, index) => (
                <tr key={user.id} className="border-t border-zinc-100">
                  <td className="p-4"><input type="checkbox" checked={selected.includes(user.id)} onChange={(event) => setSelected((value) => event.target.checked ? [...value, user.id] : value.filter((id) => id !== user.id))} /></td>
                  <td className="p-4 font-bold">{index + 1}</td>
                  <td className="p-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-zinc-900 text-xs font-black text-white">{initials(user.full_name)}</div><div><p className="font-black">{user.full_name}</p><p className="text-xs text-zinc-500">{formatDate(user.created_at)}</p></div></div></td>
                  <td className="p-4">{user.email}</td><td className="p-4">{user.phone || '-'}</td><td className="p-4 font-bold capitalize">{user.role}</td><td className="p-4"><Badge value={user.kyc_status} /></td><td className="p-4 font-bold">{user.bookings_count}</td><td className="p-4"><Badge value={user.is_active ? 'active' : 'suspended'} /></td>
                  <td className="p-4 overflow-visible relative">
                    <div className="flex gap-2 items-center">
                      <TooltipButton icon={Eye} tooltip="View Details" onClick={() => openDetails(user)} />
                      <TooltipButton icon={Pencil} tooltip="Edit User" onClick={() => setRoleUser(user)} />
                      {user.is_active ? (
                        <TooltipButton icon={Ban} tooltip="Suspend User" onClick={() => suspend(user, false)} hoverColor="hover:text-red-600" />
                      ) : (
                        <TooltipButton icon={CheckCircle} tooltip="Activate User" onClick={() => suspend(user, true)} hoverColor="hover:text-emerald-600" />
                      )}
                      <TooltipButton icon={Trash2} tooltip="Delete User" onClick={() => handleDeleteUser(user)} hoverColor="hover:text-red-600" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {details && <UserPanel details={details} onClose={() => setDetails(null)} />}
      {roleUser && <RoleModal user={roleUser} onClose={() => setRoleUser(null)} onSaved={load} />}
    </div>
  )
}

function TooltipButton({ icon: Icon, tooltip, onClick, hoverColor = "hover:text-[#E31837]" }) {
  return (
    <div className="relative group inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClick(e)
        }}
        className="p-1.5 rounded border border-zinc-200 bg-white hover:bg-zinc-50 transition-all hover:scale-105 shadow-sm flex items-center justify-center"
      >
        <Icon size={16} className={`text-zinc-600 transition-colors ${hoverColor}`} />
      </button>
      <div className="
        absolute bottom-full left-1/2 -translate-x-1/2 mb-2
        bg-zinc-900 text-white text-xs rounded px-2.5 py-1.5
        whitespace-nowrap pointer-events-none
        opacity-0 group-hover:opacity-100
        transition-opacity duration-150 z-50 shadow-md font-bold
      ">
        {tooltip}
        <div className="absolute top-full left-1/2 -translate-x-1/2
          border-4 border-transparent border-t-zinc-900" />
      </div>
    </div>
  )
}

function ManagerTable({ rows, openDetails, suspend, setRoleUser, handleDemote, handleDeleteUser }) {
  return (
    <div className="overflow-x-auto overflow-y-visible rounded-lg border border-zinc-200 bg-white shadow-sm">
      <table className="w-full min-w-[1050px] text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
          <tr>
            <th className="p-4">Manager name</th>
            <th className="p-4">Email</th>
            <th className="p-4">Assigned by</th>
            <th className="p-4">Vehicles Count</th>
            <th className="p-4">Active Bookings</th>
            <th className="p-4">Revenue</th>
            <th className="p-4">Status</th>
            <th className="p-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((manager) => (
            <tr key={manager.id} className="border-t border-zinc-100">
              <td className="p-4 font-black">{manager.full_name}</td>
              <td className="p-4">{manager.email}</td>
              <td className="p-4">{manager.assigned_by_name || 'Admin'}</td>
              <td className="p-4 font-bold">{manager.vehicles_count || manager.cars_count || 0}</td>
              <td className="p-4 font-bold">{manager.active_bookings || 0}</td>
              <td className="p-4 font-black">{formatMoney(manager.revenue || 0)}</td>
              <td className="p-4"><Badge value={manager.status || (manager.is_active ? 'active' : 'suspended')} /></td>
              <td className="p-4 overflow-visible relative">
                <div className="flex gap-2 items-center">
                  <TooltipButton icon={Eye} tooltip="View Details" onClick={() => openDetails(manager)} />
                  <TooltipButton icon={Pencil} tooltip="Edit User" onClick={() => setRoleUser(manager)} />
                  {manager.is_active ? (
                    <TooltipButton icon={Ban} tooltip="Suspend User" onClick={() => suspend(manager, false)} hoverColor="hover:text-red-600" />
                  ) : (
                    <TooltipButton icon={CheckCircle} tooltip="Activate User" onClick={() => suspend(manager, true)} hoverColor="hover:text-emerald-600" />
                  )}
                  <TooltipButton icon={UserMinus} tooltip="Demote to Customer" onClick={() => handleDemote(manager)} hoverColor="hover:text-amber-600" />
                  <TooltipButton icon={Trash2} tooltip="Delete User" onClick={() => handleDeleteUser(manager)} hoverColor="hover:text-red-600" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Badge({ value }) {
  const red = ['rejected', 'suspended', 'inactive'].includes(value)
  const green = ['approved', 'active'].includes(value)
  return <span className={`rounded-full px-2 py-1 text-xs font-black capitalize ${green ? 'bg-emerald-50 text-emerald-700' : red ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{value?.replaceAll('_', ' ')}</span>
}

function UserPanel({ details, onClose }) {
  const { user, kyc } = details
  const docs = [kyc?.dl_front_image, kyc?.dl_back_image, kyc?.aadhar_front_image, kyc?.aadhar_back_image].filter(Boolean)
  return (
    <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto border-l border-zinc-200 bg-white p-6 shadow-2xl">
      <div className="flex items-center justify-between"><h3 className="text-xl font-black">User Details</h3><button onClick={onClose} className="rounded-md p-2 hover:bg-zinc-100"><X size={20} /></button></div>
      <div className="mt-6 flex items-center gap-4"><div className="grid h-16 w-16 place-items-center rounded-full bg-zinc-900 text-xl font-black text-white">{initials(user.full_name)}</div><div><h4 className="text-lg font-black">{user.full_name}</h4><p className="font-bold text-zinc-500">{user.email}</p></div></div>
      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <Info label="Phone" value={user.phone || '-'} /><Info label="Role" value={user.role} /><Info label="Wallet" value={formatMoney(details.wallet_balance)} /><Info label="Member since" value={formatDate(user.created_at)} />
      </dl>
      <section className="mt-6"><h4 className="font-black">KYC</h4><p className="mt-2"><Badge value={kyc?.status || 'not_submitted'} /></p><div className="mt-3 grid grid-cols-2 gap-3">{docs.map((doc) => <img key={doc} alt="" src={doc} className="h-32 w-full rounded-md border border-zinc-200 object-cover" />)}</div></section>
      <section className="mt-6"><h4 className="font-black">Recent Bookings</h4><div className="mt-3 space-y-2">{details.recent_bookings.map((booking) => <div key={booking.id} className="rounded-md border border-zinc-200 p-3"><p className="font-black">{booking.booking_ref} · {booking.vehicle_name}</p><p className="text-sm text-zinc-500">{booking.status} · {formatMoney(booking.total_amount)}</p></div>)}</div></section>
    </aside>
  )
}

function Info({ label, value }) {
  return <div className="rounded-md bg-zinc-50 p-3"><dt className="text-xs font-black uppercase text-zinc-500">{label}</dt><dd className="mt-1 font-black">{value}</dd></div>
}

function RoleModal({ user, onClose, onSaved }) {
  const [role, setRole] = useState(user.role || 'customer')
  const save = async () => {
    await patchAdmin(`/users/${user.id}`, { role })
    toast.success('Role updated')
    onSaved()
    onClose()
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
        <h3 className="text-lg font-black">Change Role</h3>
        <select className="input mt-4" value={role} onChange={(event) => setRole(event.target.value)}><option value="customer">Customer</option><option value="vehicle_manager">Vehicle Manager</option></select>
        <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded-md border border-zinc-200 px-4 py-2 font-black">Cancel</button><button onClick={save} className="rounded-md bg-[#E31837] px-4 py-2 font-black text-white">Save</button></div>
      </div>
    </div>
  )
}
