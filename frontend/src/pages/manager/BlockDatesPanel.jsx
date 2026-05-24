import React, { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import api from '../../services/api'

const reasons = ['Maintenance', 'Personal Use', 'Repair', 'Inspection', 'Other']

export default function BlockDatesPanel({ vehicles = [], vehicleId = '', initialBlocks = [], onBlocksChange }) {
  const [selected, setSelected] = useState(vehicleId || vehicles[0]?.id || '')
  const [blocks, setBlocks] = useState(initialBlocks)
  const [form, setForm] = useState({ blocked_from: '', blocked_to: '', reason: 'Maintenance', note: '' })

  useEffect(() => setSelected(vehicleId || vehicles[0]?.id || ''), [vehicleId, vehicles])
  useEffect(() => setBlocks(initialBlocks), [initialBlocks])

  async function loadBlocks(id = selected) {
    if (!id) return
    const response = await api.get(`/vehicles/${id}`)
    const next = response.data.availability_blocks || []
    setBlocks(next)
    onBlocksChange?.(next)
  }

  async function addBlock(event) {
    event.preventDefault()
    const response = await api.post(`/vehicles/${selected}/block-dates`, form)
    const next = [...blocks, response.data]
    setBlocks(next)
    onBlocksChange?.(next)
    setForm({ blocked_from: '', blocked_to: '', reason: 'Maintenance', note: '' })
  }

  async function removeBlock(blockId) {
    await api.delete(`/vehicles/${selected}/block-dates/${blockId}`)
    const next = blocks.filter((block) => block.id !== blockId)
    setBlocks(next)
    onBlocksChange?.(next)
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-black text-zinc-950">Block Dates</h2>
      <form onSubmit={addBlock} className="mt-4 grid gap-3">
        {vehicles.length > 0 && <select value={selected} onChange={(event) => { setSelected(event.target.value); loadBlocks(event.target.value) }} className="input"><option value="">Select vehicle</option>{vehicles.map((car) => <option key={car.id} value={car.id}>{car.title}</option>)}</select>}
        <div className="grid gap-3 sm:grid-cols-2">
          <input type="datetime-local" value={form.blocked_from} onChange={(event) => setForm((current) => ({ ...current, blocked_from: event.target.value }))} className="input" required />
          <input type="datetime-local" value={form.blocked_to} onChange={(event) => setForm((current) => ({ ...current, blocked_to: event.target.value }))} className="input" required />
        </div>
        <select value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} className="input">{reasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select>
        <input placeholder="Optional note" value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} className="input" />
        <button disabled={!selected} className="inline-flex items-center justify-center gap-2 rounded-md bg-sigfleet px-4 py-3 font-bold text-white disabled:bg-zinc-300"><Plus size={18} /> Block These Dates</button>
      </form>
      <div className="mt-5 space-y-2">{blocks.map((block) => <div key={block.id} className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 p-3"><div><p className="font-bold text-zinc-900">{block.blocked_from} → {block.blocked_to}</p><p className="text-sm text-zinc-500">{block.reason}</p></div><button onClick={() => removeBlock(block.id)} className="grid h-9 w-9 place-items-center rounded-md bg-red-50 text-red-700"><Trash2 size={18} /></button></div>)}</div>
    </section>
  )
}
