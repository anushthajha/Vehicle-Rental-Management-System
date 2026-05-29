import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Send } from 'lucide-react'
import { formatDate, getAdmin, patchAdmin, postAdmin } from './adminApi'

const statuses = ['all', 'open', 'in_progress', 'resolved', 'closed']

export default function AdminSupportPage() {
  const [status, setStatus] = useState('all')
  const [tickets, setTickets] = useState([])
  const [active, setActive] = useState(null)
  const [reply, setReply] = useState('')
  function load() {
    getAdmin('/support', { status, limit: 50 })
      .then((data) => {
        const items = data?.items || []
        setTickets(items)
        setActive((current) => current ? items.find((item) => item?.id === current.id) || items?.[0] || null : items?.[0] || null)
      })
      .catch(() => {
        setTickets([])
        setActive(null)
      })
    // No return value — prevents "destroy is not a function" crash
  }
  useEffect(() => { load() }, [status])
  const send = async () => {
    await postAdmin(`/support/${active.id}/reply`, { message: reply })
    setReply('')
    toast.success('Reply sent')
    load()
  }
  const update = async (kind, value) => {
    await patchAdmin(`/support/${active.id}/${kind}`, { [kind]: value })
    toast.success('Ticket updated')
    load()
  }
  return <div className="space-y-5"><div><h2 className="text-2xl font-black">Support</h2><p className="text-sm font-bold text-zinc-500">Resolve customer issues from a split ticket inbox.</p></div><section className="grid min-h-[72vh] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm xl:grid-cols-[40%_60%]"><aside className="border-r border-zinc-200"><div className="flex flex-wrap gap-2 border-b border-zinc-200 p-4">{statuses.map((item) => <button key={item} onClick={() => setStatus(item)} className={`rounded-md px-3 py-2 text-xs font-black capitalize ${status === item ? 'bg-[#E31837] text-white' : 'bg-zinc-100 text-zinc-700'}`}>{item.replace('_', ' ')}</button>)}</div><div className="max-h-[68vh] overflow-y-auto">{tickets.map((ticket) => <button key={ticket?.id} onClick={() => setActive(ticket)} className={`block w-full border-b border-zinc-100 p-4 text-left hover:bg-zinc-50 ${active?.id === ticket?.id ? 'bg-red-50' : ''}`}><div className="flex items-center justify-between gap-3"><h3 className="font-black">{ticket?.subject || 'Untitled ticket'}</h3>{ticket?.status === 'open' && <span className="h-2 w-2 rounded-full bg-[#E31837]" />}</div><div className="mt-2 flex gap-2"><Badge value={ticket?.category} /><Badge value={ticket?.priority} /></div><p className="mt-2 text-sm font-bold text-zinc-500">{ticket?.user?.name || 'Anonymous'} · {ticket?.booking_ref || 'No booking'}</p><p className="text-xs text-zinc-400">{formatDate(ticket?.updated_at)}</p></button>)}</div></aside><section className="flex min-h-[72vh] flex-col">{active ? <><header className="border-b border-zinc-200 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-black">{active?.subject || 'Untitled ticket'}</h3><p className="text-sm font-bold text-zinc-500">#{active?.id?.slice(0, 8) || 'ticket'} · {active?.user?.name || 'Anonymous'} · {active?.user?.email || 'No email'} · {active?.booking_ref || 'No booking ref'}</p></div><div className="flex gap-2"><select className="input w-40" value={active?.status || 'open'} onChange={(event) => update('status', event.target.value)}><option value="open">Open</option><option value="in_progress">In Progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select><select className="input w-32" value={active?.priority || 'medium'} onChange={(event) => update('priority', event.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div></div></header><div className="flex-1 space-y-3 overflow-y-auto bg-zinc-50 p-5">{(active?.messages || []).map((message) => <div key={message?._id || message?.id || message?.created_at} className={`max-w-[78%] rounded-lg p-3 shadow-sm ${message?.is_staff_reply ? 'ml-auto bg-[#E31837] text-white' : 'bg-white text-zinc-900'}`}><p className="text-xs font-black">{message?.is_staff_reply ? 'SigFleet Support' : message?.sender_name || 'Customer'}</p><p className="mt-1 text-sm font-medium">{message?.message || ''}</p><p className="mt-2 text-xs opacity-70">{formatDate(message?.created_at)}</p></div>)}</div><footer className="border-t border-zinc-200 p-4"><div className="flex gap-3"><textarea className="input min-h-20 flex-1" value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a staff reply" /><button onClick={send} disabled={!reply.trim()} className="inline-flex items-center gap-2 self-end rounded-md bg-[#E31837] px-4 py-3 font-black text-white disabled:opacity-50"><Send size={18} /> Send Reply</button></div></footer></> : <div className="grid flex-1 place-items-center text-sm font-bold text-zinc-500">No ticket selected.</div>}</section></section></div>
}

function Badge({ value }) {
  const red = ['high', 'open'].includes(value)
  const green = ['resolved', 'closed', 'low'].includes(value)
  return <span className={`rounded-full px-2 py-1 text-xs font-black capitalize ${red ? 'bg-red-50 text-red-700' : green ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{value?.replaceAll('_', ' ')}</span>
}
