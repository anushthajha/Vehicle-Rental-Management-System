import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Check, Star, X } from 'lucide-react'
import { formatDate, formatMoney, getAdmin, patchAdmin } from './adminApi'
import { useVehicleCategories } from '../../hooks/useVehicleCategories'

const tabs = ['pending', 'approved', 'rejected', 'all']

export default function AdminCarsPage() {
  const [tab, setTab] = useState('pending')
  const [cars, setCars] = useState([])
  const [filters, setFilters] = useState({ city: '', category: '', sort: 'newest' })
  const { categories } = useVehicleCategories()
  const [activeCar, setActiveCar] = useState(null)
  const [rejecting, setRejecting] = useState(null)

  const load = () => getAdmin('/cars', { status: tab, ...filters, city: filters.city || undefined, category_id: filters.category || undefined, limit: 50 }).then((data) => setCars(data.items || []))
  useEffect(load, [tab, filters])

  const approve = async (car) => {
    await patchAdmin(`/cars/${car.id}/approve`)
    toast.success('Car approved')
    load()
  }
  const feature = async (car) => {
    await patchAdmin(`/cars/${car.id}/feature`)
    toast.success('Featured status updated')
    load()
  }

  return (
    <div className="space-y-5">
      <div><h2 className="text-2xl font-black">Cars</h2><p className="text-sm font-bold text-zinc-500">Approve listings, reject incomplete submissions, and manage featured cars.</p></div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-md px-4 py-2 text-sm font-black capitalize ${tab === item ? 'bg-[#E31837] text-white' : 'border border-zinc-200 bg-white'}`}>{item}</button>)}
      </div>
      <div className="flex flex-wrap gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <input className="input w-56" placeholder="City" value={filters.city} onChange={(event) => setFilters((value) => ({ ...value, city: event.target.value }))} />
        <select className="input w-52" value={filters.category} onChange={(event) => setFilters((value) => ({ ...value, category: event.target.value }))}><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
        <select className="input w-44" value={filters.sort} onChange={(event) => setFilters((value) => ({ ...value, sort: event.target.value }))}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="price">Price</option><option value="rating">Rating</option></select>
      </div>
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="p-4">Car</th><th className="p-4">Manager</th><th className="p-4">Category</th><th className="p-4">Price/day</th><th className="p-4">Trips</th><th className="p-4">Status</th><th className="p-4">Listed</th><th className="p-4">Actions</th></tr></thead>
          <tbody>{cars.map((car) => <tr key={car.id} className="border-t border-zinc-100">
            <td className="p-4"><div className="flex items-center gap-3"><img alt="" src={car.image || '/vite.svg'} className="h-14 w-20 rounded-md object-cover" /><div><p className="font-black">{car.title}</p><p className="text-xs font-bold text-zinc-500">{car.city}</p></div></div></td>
            <td className="p-4 font-bold">{car.manager.name}</td><td className="p-4 capitalize">{car.category_name || car.category}</td><td className="p-4 font-black">{formatMoney(car.price_per_day)}</td><td className="p-4">{car.trips}</td><td className="p-4"><Badge value={car.status} /></td><td className="p-4">{formatDate(car.listed_date)}</td>
            <td className="p-4"><div className="flex gap-2">{car.status === 'pending' && <><button title="Approve" onClick={() => approve(car)} className="rounded-md bg-emerald-600 p-2 text-white"><Check size={16} /></button><button title="Reject" onClick={() => setRejecting(car)} className="rounded-md bg-[#E31837] p-2 text-white"><X size={16} /></button></>}<button title="Feature" onClick={() => feature(car)} className={`rounded-md border p-2 ${car.is_featured ? 'border-amber-400 text-amber-500' : 'border-zinc-200'}`}><Star size={16} fill={car.is_featured ? 'currentColor' : 'none'} /></button><button onClick={() => setActiveCar(car)} className="rounded-md border border-zinc-200 px-3 py-2 text-xs font-black">Details</button></div></td>
          </tr>)}</tbody>
        </table>
      </div>
      {activeCar && <CarPanel car={activeCar} onClose={() => setActiveCar(null)} onApprove={approve} onReject={() => setRejecting(activeCar)} />}
      {rejecting && <RejectModal car={rejecting} onClose={() => setRejecting(null)} onDone={load} />}
    </div>
  )
}

function Badge({ value }) {
  const styles = value === 'approved' ? 'bg-emerald-50 text-emerald-700' : value === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
  return <span className={`rounded-full px-2 py-1 text-xs font-black capitalize ${styles}`}>{value}</span>
}

function CarPanel({ car, onClose, onApprove, onReject }) {
  return <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto border-l border-zinc-200 bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h3 className="text-xl font-black">{car.title}</h3><button onClick={onClose} className="rounded-md p-2 hover:bg-zinc-100"><X size={20} /></button></div><img alt="" src={car.image || '/vite.svg'} className="mt-5 h-64 w-full rounded-lg object-cover" /><div className="mt-5 flex gap-2"><button onClick={() => onApprove(car)} className="rounded-md bg-emerald-600 px-4 py-2 font-black text-white">Approve</button><button onClick={onReject} className="rounded-md bg-[#E31837] px-4 py-2 font-black text-white">Reject</button></div><dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><Info label="Manager" value={car.manager.name} /><Info label="City" value={car.city} /><Info label="Price/day" value={formatMoney(car.price_per_day)} /><Info label="Rating" value={car.rating} /><Info label="Status" value={car.status} /><Info label="Trips" value={car.trips} /></dl><p className="mt-5 text-sm font-bold text-zinc-600">{car.description || 'No description provided.'}</p></aside>
}

function Info({ label, value }) {
  return <div className="rounded-md bg-zinc-50 p-3"><dt className="text-xs font-black uppercase text-zinc-500">{label}</dt><dd className="mt-1 font-black">{value}</dd></div>
}

function RejectModal({ car, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const save = async () => {
    await patchAdmin(`/cars/${car.id}/reject`, { reason })
    toast.success('Car rejected')
    onDone()
    onClose()
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"><h3 className="text-lg font-black">Reject {car.title}</h3><textarea className="input mt-4 min-h-32" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for manager" /><div className="mt-4 flex justify-end gap-2"><button onClick={onClose} className="rounded-md border border-zinc-200 px-4 py-2 font-black">Cancel</button><button disabled={reason.length < 3} onClick={save} className="rounded-md bg-[#E31837] px-4 py-2 font-black text-white disabled:opacity-50">Reject</button></div></div></div>
}
