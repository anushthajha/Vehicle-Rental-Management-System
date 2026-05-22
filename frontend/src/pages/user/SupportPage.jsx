import React, { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, Paperclip, Plus, Send, X } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import DashboardShell from './DashboardShell'

const FILTERS = ['all', 'open', 'in_progress', 'resolved']
const CATEGORIES = [
  ['booking', 'Booking Issue'],
  ['payment', 'Payment'],
  ['car_issue', 'Car Issue'],
  ['account', 'Account'],
  ['other', 'Other'],
]

export default function SupportPage() {
  const [tickets, setTickets] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  async function loadTickets() {
    setLoading(true)
    const response = await api.get('/support/tickets')
    setTickets(response.data.tickets || [])
    setLoading(false)
    if (!selectedId && response.data.tickets?.[0]) setSelectedId(response.data.tickets[0].id)
  }

  useEffect(() => { loadTickets() }, [])
  useEffect(() => {
    async function loadSelected() {
      if (!selectedId) {
        setSelected(null)
        return
      }
      const response = await api.get(`/support/tickets/${selectedId}`)
      setSelected(response.data)
    }
    loadSelected()
  }, [selectedId])

  const visible = useMemo(() => tickets.filter((ticket) => filter === 'all' || ticket.status === filter), [tickets, filter])

  async function afterCreate(ticketId) {
    setModalOpen(false)
    await loadTickets()
    setSelectedId(ticketId)
  }

  return (
    <DashboardShell title="Support" eyebrow="Help desk" actions={<button onClick={() => setModalOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-zoomcar px-4 py-3 font-black text-white"><Plus size={18} /> New Ticket</button>}>
      <div className="grid min-h-[680px] gap-6 xl:grid-cols-[360px_1fr]">
        <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 p-4">
            <div className="flex flex-wrap gap-2">{FILTERS.map((item) => <button key={item} onClick={() => setFilter(item)} className={`rounded-md px-3 py-2 text-sm font-black capitalize ${filter === item ? 'bg-zoomcar text-white' : 'bg-zinc-100 text-zinc-600'}`}>{item.replace('_', ' ')}</button>)}</div>
          </div>
          {loading ? <div className="grid h-64 place-items-center"><Loader2 className="animate-spin text-zoomcar" /></div> : visible.length ? (
            <div className="divide-y divide-zinc-100">
              {visible.map((ticket) => <TicketItem key={ticket.id} ticket={ticket} active={selectedId === ticket.id} onClick={() => setSelectedId(ticket.id)} />)}
            </div>
          ) : <div className="grid h-64 place-items-center p-6 text-center font-bold text-zinc-500">No tickets in this filter</div>}
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
          {selected ? <TicketChat data={selected} onReload={() => { loadTickets(); setSelectedId(selected.ticket.id) }} /> : <div className="grid h-full min-h-96 place-items-center text-center font-bold text-zinc-500">Select a ticket</div>}
        </section>
      </div>
      <NewTicketModal open={modalOpen} onOpenChange={setModalOpen} onCreated={afterCreate} />
    </DashboardShell>
  )
}

function TicketItem({ ticket, active, onClick }) {
  return (
    <button onClick={onClick} className={`w-full p-4 text-left transition ${active ? 'bg-red-50' : 'hover:bg-zinc-50'}`}>
      <div className="flex items-start justify-between gap-3"><h3 className="font-black text-zinc-950">{ticket.subject}</h3><StatusBadge value={ticket.status} /></div>
      <div className="mt-2 flex flex-wrap gap-2"><Badge>{ticket.category.replace('_', ' ')}</Badge><PriorityBadge value={ticket.priority} /></div>
      <p className="mt-3 truncate text-sm font-bold text-zinc-500">{ticket.latest_message?.message || ticket.description}</p>
      <p className="mt-2 text-xs font-bold text-zinc-400">{formatDate(ticket.updated_at)}</p>
    </button>
  )
}

function TicketChat({ data, onReload }) {
  const [message, setMessage] = useState('')
  const [attachment, setAttachment] = useState(null)
  const ticket = data.ticket

  async function send(event) {
    event.preventDefault()
    if (!message.trim()) return
    const form = new FormData()
    form.append('message', message)
    if (attachment) form.append('attachment', attachment)
    await api.post(`/support/tickets/${ticket.id}/messages`, form)
    setMessage('')
    setAttachment(null)
    onReload()
  }

  async function closeTicket() {
    await api.patch(`/support/tickets/${ticket.id}/close`)
    toast.success('Ticket closed')
    onReload()
  }

  return (
    <div className="flex h-full min-h-[680px] flex-col">
      <header className="border-b border-zinc-100 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-xl font-black">{ticket.subject}</h2><div className="mt-2 flex flex-wrap gap-2"><StatusBadge value={ticket.status} /><PriorityBadge value={ticket.priority} /><Badge>{ticket.category.replace('_', ' ')}</Badge></div></div>
          {ticket.status !== 'closed' && <button onClick={closeTicket} className="rounded-md border border-red-200 px-4 py-2 font-black text-red-700">Close Ticket</button>}
        </div>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto bg-zinc-50 p-5">
        {data.messages.map((item) => <MessageBubble key={item._id} item={item} />)}
      </div>
      {ticket.status !== 'closed' && (
        <form onSubmit={send} className="border-t border-zinc-100 p-4">
          <textarea className="input min-h-24" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Reply to support..." />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 font-black"><Paperclip size={18} /> Attachment<input type="file" hidden onChange={(event) => setAttachment(event.target.files?.[0] || null)} /></label>
            {attachment && <span className="text-sm font-bold text-zinc-500">{attachment.name}</span>}
            <button className="inline-flex items-center gap-2 rounded-md bg-zoomcar px-4 py-3 font-black text-white"><Send size={18} /> Send</button>
          </div>
        </form>
      )}
    </div>
  )
}

function MessageBubble({ item }) {
  if (item.sender_role === 'system') return <div className="text-center text-sm italic text-zinc-500">{item.message}</div>
  const staff = item.is_staff_reply
  return (
    <div className={`flex ${staff ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[78%] rounded-lg px-4 py-3 ${staff ? 'bg-white text-zinc-800 shadow-sm' : 'bg-blue-600 text-white'}`}>
        {staff && <p className="mb-1 text-xs font-black text-zinc-500">Zoomcar Support</p>}
        <p className="whitespace-pre-wrap text-sm font-medium">{item.message}</p>
        {item.attachment_url && <a href={item.attachment_url} className="mt-2 block text-xs font-black underline">Attachment</a>}
        <p className={`mt-2 text-xs font-bold ${staff ? 'text-zinc-400' : 'text-blue-100'}`}>{formatDate(item.created_at)}</p>
      </div>
    </div>
  )
}

function NewTicketModal({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState({ category: 'booking', booking_ref: '', subject: '', description: '' })
  const [submitting, setSubmitting] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setSubmitting(true)
    try {
      const response = await api.post('/support/tickets', { ...form, booking_ref: form.booking_ref || null })
      toast.success('Ticket created')
      setForm({ category: 'booking', booking_ref: '', subject: '', description: '' })
      onCreated(response.data.ticket_id)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not create ticket')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl">
          <div className="flex items-center justify-between"><Dialog.Title className="text-xl font-black">New Ticket</Dialog.Title><Dialog.Close><X className="text-zinc-500" /></Dialog.Close></div>
          <form onSubmit={submit} className="mt-5 grid gap-4">
            <select className="input h-11" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <input className="input h-11" value={form.booking_ref} onChange={(event) => setForm((current) => ({ ...current, booking_ref: event.target.value.toUpperCase() }))} placeholder="Booking Ref (optional)" />
            <input className="input h-11" value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} placeholder="Subject" required />
            <textarea className="input min-h-32" minLength={20} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description" required />
            <button disabled={submitting} className="inline-flex justify-center rounded-md bg-zoomcar px-4 py-3 font-black text-white disabled:opacity-60">{submitting ? <Loader2 className="animate-spin" /> : 'Submit Ticket'}</button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Badge({ children }) {
  return <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-black capitalize text-zinc-600">{children}</span>
}

function StatusBadge({ value }) {
  const colors = value === 'closed' || value === 'resolved' ? 'bg-emerald-50 text-emerald-700' : value === 'in_progress' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
  return <span className={`rounded-full px-2 py-1 text-xs font-black capitalize ${colors}`}>{value.replace('_', ' ')}</span>
}

function PriorityBadge({ value }) {
  const colors = value === 'high' ? 'bg-red-50 text-red-700' : value === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-zinc-100 text-zinc-600'
  return <span className={`rounded-full px-2 py-1 text-xs font-black capitalize ${colors}`}>{value}</span>
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : ''
}
