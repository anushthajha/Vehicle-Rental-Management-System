import React, { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import * as Icons from 'lucide-react'
import { deleteAdmin, formatDate, getAdmin, patchAdmin, postAdmin } from './adminApi'

const ICON_NAMES = ['Vehicle', 'CarFront', 'Truck', 'Zap', 'Bike', 'Bus', 'Ship', 'Navigation', 'MapPin', 'Gauge', 'Fuel', 'BatteryCharging', 'Shield', 'Star', 'Crown', 'Sun', 'Mountain', 'Briefcase', 'Users', 'BadgeIndianRupee', 'Van', 'Circle']

function slugify(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState([])
  const [types, setTypes] = useState([])
  const [categoryModal, setCategoryModal] = useState(null)
  const [typeModal, setTypeModal] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  async function load() {
    const [categoryResponse, typeResponse] = await Promise.all([getAdmin('/categories'), getAdmin('/vehicle-types')])
    setCategories(categoryResponse.categories || [])
    setTypes(typeResponse.vehicle_types || [])
  }

  useEffect(() => { load() }, [])

  async function saveOrder(nextCategories) {
    setCategories(nextCategories)
    await patchAdmin('/categories/reorder', nextCategories.map((item, index) => ({ category_id: item.id, display_order: index + 1 })))
    load()
  }

  function onDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = categories.findIndex((item) => item.id === active.id)
    const newIndex = categories.findIndex((item) => item.id === over.id)
    saveOrder(arrayMove(categories, oldIndex, newIndex))
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <PanelHeader title="Vehicle Categories" onAdd={() => setCategoryModal({})} />
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={categories.map((item) => item.id)} strategy={verticalListSortingStrategy}>
            <div className="mt-4 space-y-2">
              {categories.map((category) => <CategoryRow key={category.id} category={category} onEdit={() => setCategoryModal(category)} onDelete={() => setDeleteTarget(category)} onToggle={() => patchAdmin(`/categories/${category.id}`, { is_active: !category.is_active }).then(load)} />)}
            </div>
          </SortableContext>
        </DndContext>
        <Footnote />
      </section>
      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <PanelHeader title="Vehicle Types" onAdd={() => setTypeModal({})} addLabel="+ Add Type" />
        <div className="mt-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {types.map((type) => <div key={type.id} className={`grid gap-3 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center ${type.is_active ? '' : 'bg-zinc-50 text-zinc-400'}`}><div><p className="font-black">{type.name}</p><p className="text-xs font-bold text-zinc-500">{type.slug} · {type.vehicle_count || 0} vehicles</p></div><button onClick={() => patchAdmin(`/vehicle-types/${type.id}`, { is_active: !type.is_active }).then(load)} className={`rounded-full px-3 py-1 text-xs font-black ${type.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-200 text-zinc-600'}`}>{type.is_active ? 'Active' : 'Inactive'}</button><div className="flex gap-2"><button className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-black" onClick={() => setTypeModal(type)}>Edit</button><button className="rounded-md bg-red-50 px-3 py-2 text-sm font-black text-sigfleet" onClick={() => deleteAdmin(`/vehicle-types/${type.id}`).then(load)}>Delete</button></div></div>)}
        </div>
        <Footnote />
      </section>
      {categoryModal && <CategoryModal category={categoryModal} onClose={() => setCategoryModal(null)} onSaved={() => { setCategoryModal(null); load() }} />}
      {typeModal && <TypeModal type={typeModal} onClose={() => setTypeModal(null)} onSaved={() => { setTypeModal(null); load() }} />}
      {deleteTarget && <DeleteCategoryModal category={deleteTarget} categories={categories} onClose={() => setDeleteTarget(null)} onDeleted={() => { setDeleteTarget(null); load() }} />}
    </div>
  )
}

function PanelHeader({ title, onAdd, addLabel = '+ Add Category' }) {
  return <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-black">{title}</h2><p className="text-sm font-bold text-zinc-500">Changes reflect immediately across the platform.</p></div><button onClick={onAdd} className="rounded-md bg-sigfleet px-4 py-3 font-black text-white">{addLabel}</button></div>
}

function CategoryRow({ category, onEdit, onDelete, onToggle }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: category.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const Icon = Icons[category.icon_name] || Icons.Car
  return <div ref={setNodeRef} style={style} className={`grid gap-3 rounded-lg border border-zinc-200 p-3 sm:grid-cols-[auto_auto_1fr_auto_auto] sm:items-center ${category.is_active ? 'bg-white' : 'bg-zinc-50 text-zinc-400'}`}><button {...attributes} {...listeners} className="cursor-grab text-xl font-black text-zinc-400">⠿</button><span className="grid h-10 w-10 place-items-center rounded-md bg-red-50 text-sigfleet"><Icon size={20} /></span><div><p className="font-black">{category.name} {!category.is_active && <span className="ml-2 rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-600">Inactive</span>}</p><p className="text-xs font-bold text-zinc-500">{category.slug} · {category.vehicle_count || 0} vehicles · Modified {formatDate(category.updated_at)}</p></div><button onClick={onToggle} className={`rounded-full px-3 py-1 text-xs font-black ${category.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-200 text-zinc-600'}`}>{category.is_active ? 'Active' : 'Inactive'}</button><div className="flex gap-2"><button className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-black" onClick={onEdit}>Edit</button><button className="rounded-md bg-red-50 px-3 py-2 text-sm font-black text-sigfleet" onClick={onDelete}>Delete</button></div></div>
}

function CategoryModal({ category, onClose, onSaved }) {
  const [form, setForm] = useState({ name: category.name || '', slug: category.slug || '', description: category.description || '', icon_name: category.icon_name || 'Vehicle', display_order: category.display_order || 0, is_active: category.is_active ?? true })
  const Icon = Icons[form.icon_name] || Icons.Car
  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value, ...(key === 'name' && !category.id ? { slug: slugify(value) } : {}) }))
  }
  async function save() {
    const body = { ...form, display_order: Number(form.display_order) }
    if (category.id) await patchAdmin(`/categories/${category.id}`, body)
    else await postAdmin('/categories', body)
    onSaved()
  }
  return <Modal title={category.id ? 'Edit Category' : 'Add Category'} onClose={onClose}><div className="grid gap-4"><input className="input" placeholder="Name" value={form.name} onChange={(e) => set('name', e.target.value)} /><input className="input" placeholder="Slug" value={form.slug} onChange={(e) => set('slug', slugify(e.target.value))} /><textarea className="input min-h-24" placeholder="Description" value={form.description} onChange={(e) => set('description', e.target.value)} /><div><p className="label">Icon</p><div className="mt-2 grid grid-cols-5 gap-2">{ICON_NAMES.map((name) => { const Choice = Icons[name] || Icons.Circle; return <button key={name} onClick={() => set('icon_name', name)} className={`grid h-12 place-items-center rounded-md border ${form.icon_name === name ? 'border-sigfleet bg-red-50 text-sigfleet' : 'border-zinc-200'}`} title={name}><Choice size={20} /></button> })}</div><p className="mt-2 flex items-center gap-2 text-sm font-bold text-zinc-600">Selected: <Icon size={18} /> {form.icon_name}</p></div><input className="input" type="number" value={form.display_order} onChange={(e) => set('display_order', e.target.value)} /><Toggle label="Active" checked={form.is_active} onChange={(checked) => set('is_active', checked)} /><button onClick={save} className="rounded-md bg-sigfleet px-4 py-3 font-black text-white">Save Category</button></div></Modal>
}

function TypeModal({ type, onClose, onSaved }) {
  const [form, setForm] = useState({ name: type.name || '', slug: type.slug || '', description: type.description || '', is_active: type.is_active ?? true })
  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value, ...(key === 'name' && !type.id ? { slug: slugify(value) } : {}) }))
  }
  async function save() {
    if (type.id) await patchAdmin(`/vehicle-types/${type.id}`, form)
    else await postAdmin('/vehicle-types', form)
    onSaved()
  }
  return <Modal title={type.id ? 'Edit Type' : 'Add Type'} onClose={onClose}><div className="grid gap-4"><input className="input" placeholder="Name" value={form.name} onChange={(e) => set('name', e.target.value)} /><input className="input" placeholder="Slug" value={form.slug} onChange={(e) => set('slug', slugify(e.target.value))} /><textarea className="input min-h-24" placeholder="Description" value={form.description} onChange={(e) => set('description', e.target.value)} /><Toggle label="Active" checked={form.is_active} onChange={(checked) => set('is_active', checked)} /><button onClick={save} className="rounded-md bg-sigfleet px-4 py-3 font-black text-white">Save Type</button></div></Modal>
}

function DeleteCategoryModal({ category, categories, onClose, onDeleted }) {
  const [replacement, setReplacement] = useState('')
  async function remove() {
    await deleteAdmin(`/categories/${category.id}${replacement ? `?reassign_to_category_id=${replacement}` : ''}`)
    onDeleted()
  }
  const otherCategories = categories.filter((item) => item.id !== category.id)
  return <Modal title="Delete Category" onClose={onClose}><div className="space-y-4"><p className="font-bold text-zinc-700">{category.vehicle_count ? `${category.vehicle_count} vehicles use this category. Pick a category to reassign before deleting.` : 'This category has no vehicles and can be deleted.'}</p>{category.vehicle_count > 0 && <select className="input" value={replacement} onChange={(e) => setReplacement(e.target.value)}><option value="">Select replacement category</option>{otherCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}<button onClick={remove} disabled={category.vehicle_count > 0 && !replacement} className="rounded-md bg-sigfleet px-4 py-3 font-black text-white disabled:opacity-50">{category.vehicle_count ? 'Reassign & Delete' : 'Delete Category'}</button></div></Modal>
}

function Toggle({ label, checked, onChange }) {
  return <label className="flex items-center justify-between rounded-md bg-zinc-50 p-3 font-bold"><span>{label}</span><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /></label>
}

function Modal({ title, children, onClose }) {
  return <Dialog.Root open onOpenChange={(open) => !open && onClose()}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(92vw,44rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-white p-6 shadow-xl"><Dialog.Title className="text-2xl font-black">{title}</Dialog.Title><div className="mt-5">{children}</div><button onClick={onClose} className="absolute right-4 top-4 rounded-md bg-zinc-100 p-2"><Icons.X size={18} /></button></Dialog.Content></Dialog.Portal></Dialog.Root>
}

function Footnote() {
  return <p className="mt-4 text-xs font-bold text-zinc-500">Last modified dates update whenever a record changes. Changes reflect immediately across the platform.</p>
}
