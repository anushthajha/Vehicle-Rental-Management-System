import React, { useEffect, useMemo, useRef, useState } from 'react'
import { HelpCircle, Loader2, Minus, Send, X } from 'lucide-react'
import api from '../../services/api'
import { useAuthStore } from '../../context/AuthContext'

const PROMPTS = {
  guest: [
    'How do I book a vehicle?',
    'How do I become a manager?',
    'What documents are needed?',
  ],
  customer: [
    'From where can I book a vehicle?',
    'How do I complete KYC?',
    'How do I cancel a booking?',
  ],
  vehicle_manager: [
    'From where can I add a car?',
    'How do I manage bookings?',
    'How do payouts work?',
  ],
  admin: [
    'Where can I approve managers?',
    'How do I approve vehicles?',
    'How do I handle support tickets?',
  ],
}

function roleLabel(role) {
  if (role === 'vehicle_manager') return 'Manager'
  if (role === 'admin') return 'Admin'
  if (role === 'customer') return 'Customer'
  return 'Guest'
}

function greetingForUser(user) {
  const role = user?.role || 'guest'
  const firstName = user?.full_name?.split(' ')[0] || 'there'
  return `Hi ${firstName}. I can answer SigFleet app questions for ${roleLabel(role).toLowerCase()} users.`
}

export default function HelpAssistantWidget() {
  const { user } = useAuthStore()
  const role = user?.role || 'guest'
  const chatSessionKey = user?.id ? `${user.id}:${role}` : 'guest'
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'assistant',
      text: greetingForUser(user),
      isGreeting: true,
    },
  ])

  const quickPrompts = useMemo(() => PROMPTS[role] || PROMPTS.guest, [role])

  useEffect(() => {
    setInput('')
    setLoading(false)
    setMessages([
      {
        id: 1,
        role: 'assistant',
        text: greetingForUser(user),
        isGreeting: true,
      },
    ])
  }, [chatSessionKey, user?.full_name])

  async function send(text = input) {
    const question = text.trim()
    if (!question || loading) return
    const conversationHistory = messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .slice(-8)
      .map((message) => ({
        role: message.role,
        text: message.text,
      }))
    setInput('')
    setMessages((current) => [...current, { id: Date.now(), role: 'user', text: question }])
    setLoading(true)
    try {
      const response = await api.post('/help/ask', {
        question,
        role,
        conversation_history: conversationHistory,
      })
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: 'assistant',
          text: response.data?.answer || 'I could not find that in SigFleet help.',
          sources: response.data?.sources || [],
          confidence: response.data?.confidence || 'high',
        },
      ])
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: 'assistant',
          text: 'Help assistant is unavailable right now. Please try again or create a support ticket.',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  }

  return (
    <div className="fixed bottom-6 right-24 z-50 flex flex-col items-end gap-3">
      {open && !minimized && (
        <div className="flex h-[500px] w-[360px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between bg-zinc-950 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-white/10">
                <HelpCircle className="text-white" size={18} />
              </div>
              <div>
                <p className="text-sm font-black text-white">SigFleet Help</p>
                <p className="text-xs font-bold text-white/70">{roleLabel(role)} FAQ Assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setMinimized(true)} className="rounded-full p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white" aria-label="Minimize help">
                <Minus size={16} />
              </button>
              <button onClick={() => setOpen(false)} className="rounded-full p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white" aria-label="Close help">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-zinc-50 p-4">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  message.role === 'user'
                    ? 'rounded-br-sm bg-sigfleet text-white'
                    : 'rounded-bl-sm border border-zinc-200 bg-white text-zinc-800'
                }`}>
                  <p className="whitespace-pre-line">{message.text}</p>
                  {message.confidence === 'low' && (
                    <p className="mt-2 text-[11px] font-black text-amber-600">Low confidence</p>
                  )}
                  {message.confidence !== 'low' && message.sources?.length > 0 && (
                    <p className="mt-2 text-[11px] font-bold text-zinc-400">
                      Source: {message.sources.map((source) => source.title).join(', ')}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-bold text-zinc-500">
                  <Loader2 className="animate-spin" size={15} /> Searching help
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-zinc-100 bg-white p-3">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => send(prompt)}
                  className="shrink-0 rounded-full border border-zinc-200 px-3 py-2 text-xs font-black text-zinc-600 transition hover:border-sigfleet hover:text-sigfleet"
                >
                  {prompt}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Ask about using SigFleet..."
                className="min-h-11 flex-1 resize-none rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-sigfleet"
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                className="grid h-11 w-11 place-items-center rounded-xl bg-zinc-950 text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                aria-label="Send help question"
              >
                {loading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => { setOpen(true); setMinimized(false) }}
        className="grid h-14 w-14 place-items-center rounded-full bg-zinc-950 text-white shadow-2xl transition hover:scale-105 hover:bg-zinc-800"
        aria-label="Open SigFleet help assistant"
      >
        <HelpCircle size={24} />
      </button>
    </div>
  )
}
