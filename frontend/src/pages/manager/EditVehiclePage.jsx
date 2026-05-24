import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import AddVehiclePage from './AddVehiclePage'
import api from '../../services/api'

export default function EditVehiclePage() {
  const { carId } = useParams()
  const [car, setCar] = useState(null)
  const [blocks, setBlocks] = useState([])
  const [rules, setRules] = useState([])
  const [blockForm, setBlockForm] = useState({ blocked_from: '', blocked_to: '', reason: '' })
  const [ruleForm, setRuleForm] = useState({ rule_type: 'long_trip_discount', discount_percent: 10, surcharge_percent: 0, min_days: 7, applies_on: '' })

  async function load() {
    const response = await api.get(`/vehicles/${carId}`)
    setCar(response.data)
    setBlocks(response.data.availability_blocks || [])
    setRules(response.data.car_pricing_rules || [])
  }

  useEffect(() => {
    load()
  }, [carId])

  async function addBlock(event) {
    event.preventDefault()
    const response = await api.post(`/vehicles/${carId}/block-dates`, blockForm)
    setBlocks((current) => [...current, response.data])
    setBlockForm({ blocked_from: '', blocked_to: '', reason: '' })
  }

  async function removeBlock(blockId) {
    await api.delete(`/vehicles/${carId}/block-dates/${blockId}`)
    setBlocks((current) => current.filter((block) => block.id !== blockId))
  }

  async function addRule(event) {
    event.preventDefault()
    const response = await api.post(`/vehicles/${carId}/pricing-rules`, ruleForm)
    setRules((current) => [...current, response.data])
  }

  async function removeRule(ruleId) {
    await api.delete(`/vehicles/${carId}/pricing-rules/${ruleId}`)
    setRules((current) => current.filter((rule) => rule.id !== ruleId))
  }

  if (!car) {
    return <main className="grid min-h-screen place-items-center bg-zinc-50"><Loader2 className="animate-spin text-sigfleet" /></main>
  }

  const initialData = {
    ...car,
    photos: (car.images || []).map((image) => ({ id: image.id, url: image.image_url, primary: image.is_primary })),
    location_lat: Number(car.location_lat || 0),
    location_lng: Number(car.location_lng || 0),
  }

  return (
    <>
      <AddVehiclePage editMode carId={carId} initialData={initialData} />
      <main className="bg-zinc-50 px-4 pb-10">
        <section className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-zinc-950">Block Dates</h2>
            <form onSubmit={addBlock} className="mt-4 grid gap-3">
              <input type="datetime-local" value={blockForm.blocked_from} onChange={(e) => setBlockForm({ ...blockForm, blocked_from: e.target.value })} className="input" required />
              <input type="datetime-local" value={blockForm.blocked_to} onChange={(e) => setBlockForm({ ...blockForm, blocked_to: e.target.value })} className="input" required />
              <input placeholder="Reason" value={blockForm.reason} onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })} className="input" />
              <button className="inline-flex items-center justify-center gap-2 rounded-md bg-sigfleet px-4 py-3 font-bold text-white"><Plus size={18} /> Block dates</button>
            </form>
            <div className="mt-5 space-y-2">{blocks.map((block) => <Row key={block.id} label={`${block.blocked_from} - ${block.blocked_to}`} detail={block.reason} onDelete={() => removeBlock(block.id)} />)}</div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-zinc-950">Pricing Rules</h2>
            <form onSubmit={addRule} className="mt-4 grid gap-3">
              <select value={ruleForm.rule_type} onChange={(e) => setRuleForm({ ...ruleForm, rule_type: e.target.value })} className="input">
                <option value="weekend_discount">Weekend discount</option>
                <option value="long_trip_discount">Long trip discount</option>
                <option value="peak_surcharge">Peak surcharge</option>
              </select>
              <input type="number" placeholder="Discount %" value={ruleForm.discount_percent} onChange={(e) => setRuleForm({ ...ruleForm, discount_percent: Number(e.target.value) })} className="input" />
              <input type="number" placeholder="Surcharge %" value={ruleForm.surcharge_percent} onChange={(e) => setRuleForm({ ...ruleForm, surcharge_percent: Number(e.target.value) })} className="input" />
              <input type="number" placeholder="Minimum days" value={ruleForm.min_days} onChange={(e) => setRuleForm({ ...ruleForm, min_days: Number(e.target.value) })} className="input" />
              <button className="inline-flex items-center justify-center gap-2 rounded-md bg-sigfleet px-4 py-3 font-bold text-white"><Plus size={18} /> Add rule</button>
            </form>
            <div className="mt-5 space-y-2">{rules.map((rule) => <Row key={rule.id} label={rule.rule_type} detail={`${rule.discount_percent || 0}% discount | ${rule.surcharge_percent || 0}% surcharge`} onDelete={() => removeRule(rule.id)} />)}</div>
          </div>
        </section>
      </main>
    </>
  )
}

function Row({ label, detail, onDelete }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 p-3">
      <div><p className="font-bold text-zinc-900">{label}</p><p className="text-sm text-zinc-500">{detail}</p></div>
      <button onClick={onDelete} className="grid h-9 w-9 place-items-center rounded-md bg-red-50 text-red-700"><Trash2 size={18} /></button>
    </div>
  )
}
