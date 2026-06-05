import React, { useEffect, useRef, useState } from 'react'
import { MessageCircle, Minus, Send, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useAuthStore } from '../../context/AuthContext'

const QUICK_REPLIES_INITIAL = [
  'Book a car 🚗',
  'Check my bookings 📋',
  'Cars in Bengaluru',
  'Help 💬',
]

const QUICK_REPLIES_AFTER_VEHICLES = [
  'Select option 1',
  'Show more options',
  'Different city',
]

const QUICK_REPLIES_AFTER_SUMMARY = [
  'Yes, confirm booking ✅',
  'Change dates',
  'Apply coupon 🏷️',
]

const QUICK_REPLIES_AFTER_CANCELLATION = [
  'Yes, cancel booking',
  'No, keep my booking',
]

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2 mb-3">
      <div className="w-8 h-8 bg-[#E31837] rounded-full flex items-center justify-center flex-shrink-0">
        <span className="text-white text-xs font-black">SB</span>
      </div>
      <div className="bg-zinc-100 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function VehicleCard({ vehicles, onSelect }) {
  if (!vehicles?.length) return null
  return (
    <div className="space-y-2 mt-2">
      {vehicles.map((v, i) => (
        <div key={v.id} className="bg-white border border-zinc-200 rounded-xl p-3 shadow-sm">
          <div className="flex gap-3">
            {v.primary_image_url && (
              <img src={v.primary_image_url} alt={v.title} className="w-16 h-12 rounded-lg object-cover flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-black text-zinc-950 text-sm truncate">{v.title}</p>
              <p className="text-xs text-zinc-500">⭐ {v.average_rating} · {v.total_trips} trips · {v.location_city}</p>
              <p className="text-xs text-zinc-500">{v.fuel_type} · {v.transmission} · {v.seats} seats</p>
            </div>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="font-black text-[#E31837] text-sm">₹{v.price_per_day.toLocaleString('en-IN')}/day</span>
            <button
              onClick={() => onSelect(v, i + 1)}
              className="bg-[#E31837] text-white text-xs font-black px-3 py-1.5 rounded-full hover:bg-red-700 transition"
            >
              Select →
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function BookingSummaryCard({ data, onConfirm, onChange }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4 mt-2 shadow-sm">
      <p className="font-black text-zinc-950 text-sm mb-3">📋 BOOKING SUMMARY</p>
      <div className="space-y-1 text-xs text-zinc-700">
        <p><span className="font-bold">Vehicle:</span> {data.vehicle_title}</p>
        <p><span className="font-bold">Pickup:</span> {data.pickup_datetime}</p>
        <p><span className="font-bold">Return:</span> {data.return_datetime}</p>
        <p><span className="font-bold">Duration:</span> {data.duration}</p>
      </div>
      <div className="border-t border-zinc-100 mt-3 pt-3 space-y-1 text-xs">
        <div className="flex justify-between"><span>Base rental</span><span>₹{data.base_amount?.toLocaleString('en-IN')}</span></div>
        {data.with_chauffeur && data.chauffeur_fee > 0 && <div className="flex justify-between"><span>Chauffeur</span><span>₹{data.chauffeur_fee?.toLocaleString('en-IN')}</span></div>}
        <div className="flex justify-between"><span>Insurance ({data.insurance_type})</span><span>₹{data.insurance_amount?.toLocaleString('en-IN')}</span></div>
        {data.coupon_discount > 0 && <div className="flex justify-between text-emerald-600"><span>Coupon discount</span><span>-₹{data.coupon_discount?.toLocaleString('en-IN')}</span></div>}
        <div className="flex justify-between font-black text-sm border-t border-zinc-100 pt-2 mt-2">
          <span>Total</span><span className="text-[#E31837]">₹{data.total_amount?.toLocaleString('en-IN')}</span>
        </div>
        <p className="text-zinc-400">+ ₹{data.security_deposit?.toLocaleString('en-IN')} refundable deposit</p>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={onConfirm} className="flex-1 bg-[#E31837] text-white text-xs font-black py-2 rounded-full hover:bg-red-700 transition">
          ✅ Confirm Booking
        </button>
        <button onClick={onChange} className="flex-1 border border-zinc-300 text-zinc-700 text-xs font-black py-2 rounded-full hover:bg-zinc-50 transition">
          ✏ Change
        </button>
      </div>
    </div>
  )
}

function PayNowCard({ bookingId, bookingRef, totalAmount, status, onPay }) {
  const isPending = status === 'pending'
  return (
    <div className={`${isPending ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'} border rounded-xl p-4 mt-2`}>
      <p className={`font-black text-sm ${isPending ? 'text-amber-800' : 'text-emerald-800'}`}>{isPending ? '⏳ Booking Pending' : '✅ Booking Created!'}</p>
      <p className={`text-xs mt-1 ${isPending ? 'text-amber-700' : 'text-emerald-700'}`}>Booking ID: <span className="font-black">{bookingRef}</span></p>
      <p className={`text-xs ${isPending ? 'text-amber-700' : 'text-emerald-700'}`}>Amount due: <span className="font-black">₹{totalAmount?.toLocaleString('en-IN')}</span></p>
      {isPending && <p className="mt-2 text-xs font-bold text-amber-700">Pay now to submit the request. The manager will review it within 24 hours.</p>}
      <button
        onClick={onPay}
        className="mt-3 w-full bg-[#E31837] text-white text-sm font-black py-2.5 rounded-full hover:bg-red-700 transition flex items-center justify-center gap-2"
      >
        💳 Pay Now →
      </button>
    </div>
  )
}

function BookingsListCard({ bookings, onCancel }) {
  if (!bookings?.length) return null
  return (
    <div className="mt-2 space-y-2">
      {bookings.map((booking, index) => (
        <div key={booking.booking_id} className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
          <p className="text-sm font-black text-zinc-950">{index + 1}. {booking.vehicle_title}</p>
          <p className="mt-1 text-xs font-bold text-zinc-500">Ref: {booking.booking_ref} · {booking.status}</p>
          <p className="mt-1 text-xs text-zinc-600">{booking.pickup_datetime} → {booking.return_datetime}</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-black text-[#E31837]">₹{booking.total_amount?.toLocaleString('en-IN')}</span>
            <button onClick={() => onCancel(booking)} className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-black text-red-600 hover:bg-red-50">
              Cancel
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function CancellationPreviewCard({ data, onConfirm, onKeep }) {
  return (
    <div className="mt-2 rounded-xl border border-amber-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-black text-amber-800">⚠️ Cancellation Preview</p>
      <div className="mt-3 space-y-1 text-xs text-zinc-700">
        <p><span className="font-bold">Vehicle:</span> {data.vehicle_title}</p>
        <p><span className="font-bold">Pickup:</span> {data.pickup_datetime}</p>
        <p><span className="font-bold">Hours until pickup:</span> {data.hours_until_pickup}</p>
      </div>
      <div className="mt-3 border-t border-zinc-100 pt-3 text-xs">
        <div className="flex justify-between"><span>Amount paid</span><span>₹{data.amount_paid?.toLocaleString('en-IN')}</span></div>
        <div className="flex justify-between"><span>Rental refund ({data.refund_percentage}%)</span><span>₹{data.booking_refund?.toLocaleString('en-IN')}</span></div>
        <div className="flex justify-between"><span>Security refund</span><span>₹{data.security_deposit_refund?.toLocaleString('en-IN')}</span></div>
        <div className="mt-2 flex justify-between border-t border-zinc-100 pt-2 text-sm font-black"><span>Total refund</span><span className="text-emerald-700">₹{data.refund_amount?.toLocaleString('en-IN')}</span></div>
        <p className="mt-1 text-emerald-700">Added to wallet instantly after confirmation.</p>
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={onConfirm} className="flex-1 rounded-full bg-red-600 px-3 py-2 text-xs font-black text-white hover:bg-red-700">Yes, Cancel Booking</button>
        <button onClick={onKeep} className="flex-1 rounded-full border border-zinc-300 px-3 py-2 text-xs font-black text-zinc-700 hover:bg-zinc-50">Keep Booking</button>
      </div>
    </div>
  )
}

function CancellationCompleteCard({ data }) {
  return (
    <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <p className="text-sm font-black text-emerald-800">✅ Booking Cancelled</p>
      <p className="mt-2 text-xs text-emerald-700">Ref: <span className="font-black">{data.booking_ref}</span></p>
      <p className="text-xs text-emerald-700">Vehicle: <span className="font-black">{data.vehicle_title}</span></p>
      <p className="mt-3 text-sm font-black text-emerald-900">₹{data.refund_amount?.toLocaleString('en-IN')} refunded to wallet</p>
      {data.new_wallet_balance != null && <p className="text-xs text-emerald-700">New wallet balance: ₹{data.new_wallet_balance?.toLocaleString('en-IN')}</p>}
    </div>
  )
}

function WalletInfoCard({ data }) {
  return (
    <div className="mt-2 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-black text-zinc-950">Wallet Balance</p>
      <p className="mt-1 text-2xl font-black text-[#E31837]">{data.formatted_balance}</p>
      {!!data.recent_transactions?.length && <div className="mt-3 space-y-1 text-xs text-zinc-600">{data.recent_transactions.map((txn, index) => <p key={index}>{txn.type === 'credit' ? '+' : '-'}₹{txn.amount?.toLocaleString('en-IN')} · {txn.description}</p>)}</div>}
    </div>
  )
}

function buildHiddenToolHistory(data) {
  if (!data?.type) return null

  let compactData = data
  if (data.type === 'vehicles') {
    compactData = {
      type: data.type,
      count: data.count,
      city: data.city,
      pickup_datetime_iso: data.pickup_datetime_iso,
      return_datetime_iso: data.return_datetime_iso,
      vehicles: data.vehicles?.map((v, index) => ({
        option: index + 1,
        id: v.id,
        title: v.title,
        make: v.make,
        model: v.model,
        price_per_day: v.price_per_day,
        fuel_type: v.fuel_type,
        transmission: v.transmission,
        seats: v.seats,
        location_city: v.location_city,
        category: v.category,
        vehicle_type: v.vehicle_type,
      })),
    }
  }

  return {
    role: 'user',
    content: `Tool result: ${JSON.stringify(compactData)}`,
  }
}

function MessageBubble({ msg, onSelectVehicle, onConfirmBooking, onChangeBooking, onPayNow, onCancelBooking, onConfirmCancellation, onKeepBooking }) {
  const isBot = msg.role === 'assistant'

  return (
    <div className={`flex ${isBot ? 'items-start' : 'justify-end'} gap-2 mb-3`}>
      {isBot && (
        <div className="w-8 h-8 bg-[#E31837] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-white text-xs font-black">SB</span>
        </div>
      )}
      <div className={`max-w-[82%] ${isBot ? '' : ''}`}>
        {isBot ? (
          <div className="bg-zinc-100 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap">
            {msg.text}
          </div>
        ) : (
          <div className="bg-[#E31837] text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed">
            {msg.text}
          </div>
        )}

        {/* Special cards */}
        {isBot && msg.data?.type === 'vehicles' && (
          <VehicleCard vehicles={msg.data.vehicles} onSelect={onSelectVehicle} />
        )}
        {isBot && msg.data?.type === 'booking_summary' && (
          <BookingSummaryCard
            data={msg.data}
            onConfirm={() => onConfirmBooking(msg.data)}
            onChange={onChangeBooking}
          />
        )}
        {isBot && msg.action === 'booking_complete' && msg.data?.type === 'booking_complete' && (
          <PayNowCard
            bookingId={msg.data.booking_id}
            bookingRef={msg.data.booking_ref}
            totalAmount={msg.data.total_amount}
            status={msg.data.status}
            onPay={() => onPayNow(msg.data.booking_id)}
          />
        )}
        {isBot && msg.data?.type === 'bookings_list' && (
          <BookingsListCard bookings={msg.data.bookings} onCancel={onCancelBooking} />
        )}
        {isBot && msg.data?.type === 'cancellation_preview' && (
          <CancellationPreviewCard
            data={msg.data}
            onConfirm={() => onConfirmCancellation(msg.data)}
            onKeep={onKeepBooking}
          />
        )}
        {isBot && msg.data?.type === 'cancellation_complete' && (
          <CancellationCompleteCard data={msg.data} />
        )}
        {isBot && msg.data?.type === 'wallet_info' && (
          <WalletInfoCard data={msg.data} />
        )}

        <p className="text-[10px] text-zinc-400 mt-1 px-1">
          {new Date(msg.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

export default function ChatbotWidget() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [chatState, setChatState] = useState('idle')
  const [sessionId] = useState(() => crypto.randomUUID())
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const firstName = user?.full_name?.split(' ')[0] || 'there'

  const [messages, setMessages] = useState([{
    id: 1, role: 'assistant', type: 'text', data: null, action: null,
    text: `Hi ${firstName}! 👋 I'm SigBot, your SigFleet booking assistant.\n\nI can help you find and book the perfect car. Just tell me where and when!\n\nTry: "Book a Creta in Bengaluru tomorrow 10am to 6pm"`,
    timestamp: new Date(),
  }])
  const [conversationHistory, setConversationHistory] = useState([])

  // Restore conversation from sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem(`chatbot_${sessionId}`)
    if (saved) {
      try {
        const { messages: m, conversationHistory: h } = JSON.parse(saved)
        if (m?.length > 1) { setMessages(m); setConversationHistory(h) }
      } catch { /* ignore */ }
    }
  }, [sessionId])

  // Save conversation to sessionStorage
  useEffect(() => {
    sessionStorage.setItem(`chatbot_${sessionId}`, JSON.stringify({ messages, conversationHistory }))
  }, [messages, conversationHistory, sessionId])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Focus input when opened
  useEffect(() => {
    if (open && !minimized) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open, minimized])

  const quickReplies = chatState === 'showing_vehicles' ? QUICK_REPLIES_AFTER_VEHICLES
    : chatState === 'showing_summary' ? QUICK_REPLIES_AFTER_SUMMARY
    : chatState === 'cancellation_preview' ? QUICK_REPLIES_AFTER_CANCELLATION
    : QUICK_REPLIES_INITIAL

  const sendMessage = async (text = inputText) => {
    const msg = text.trim()
    if (!msg || isLoading) return
    setInputText('')

    // Add user message
    setMessages((prev) => [...prev, {
      id: Date.now(), role: 'user', type: 'text', data: null, action: null,
      text: msg, timestamp: new Date(),
    }])
    setIsLoading(true)

    try {
      const res = await api.post('/chatbot/message', {
        message: msg,
        conversation_history: conversationHistory,
        session_id: sessionId,
      })
      const { reply, action, data, booking_id } = res.data

      setConversationHistory((prev) => {
        const nextHistory = [
          ...prev,
          { role: 'user', content: msg },
          { role: 'assistant', content: reply },
        ]
        const hiddenToolHistory = buildHiddenToolHistory(data)
        if (hiddenToolHistory) nextHistory.push(hiddenToolHistory)
        return nextHistory
      })

      setMessages((prev) => {
        // Remove old booking_summary cards when a new one arrives
        let filtered = prev
        if (data?.type === 'booking_summary') {
          filtered = prev.filter(m => m.data?.type !== 'booking_summary')
        }
        return [...filtered, {
          id: Date.now() + 1, role: 'assistant',
          text: reply, type: action || 'text',
          action, data, booking_id,
          timestamp: new Date(),
        }]
      })

      // Update chat state for quick replies
      if (data?.type === 'vehicles') setChatState('showing_vehicles')
      else if (data?.type === 'booking_summary') setChatState('showing_summary')
      else if (data?.type === 'cancellation_preview') setChatState('cancellation_preview')
      else if (data?.type === 'cancellation_complete') setChatState('idle')
      else if (action === 'booking_complete') setChatState('payment_ready')

    } catch (err) {
      const errMsg = err.response?.status === 429
        ? "You've sent too many messages. Please wait a bit before trying again. 😊"
        : "Sorry, I'm having trouble right now. Please try again in a moment."
      setMessages((prev) => [...prev, {
        id: Date.now() + 1, role: 'assistant', type: 'text', data: null, action: null,
        text: errMsg, timestamp: new Date(),
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectVehicle = (vehicle, index) => {
    sendMessage(`I'll take option ${index} — the ${vehicle.title}`)
  }

  const handleConfirmBooking = (summaryData) => {
    sendMessage(`Yes, confirm the booking for ${summaryData.vehicle_title}`)
  }

  const handleChangeBooking = () => {
    sendMessage('I want to change the booking details')
    setChatState('idle')
  }

  const handlePayNow = (bookingId) => {
    setOpen(false)
    navigate(`/booking/pay/${bookingId}`)
  }

  const handleCancelBooking = (booking) => {
    sendMessage(`Cancel booking ${booking.booking_ref}`)
  }

  const handleConfirmCancellation = (preview) => {
    sendMessage(`Yes, cancel booking ${preview.booking_ref}, reason: customer request`)
  }

  const handleKeepBooking = () => {
    sendMessage('No, keep my booking')
    setChatState('idle')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const clearChat = () => {
    setMessages([{
      id: Date.now(), role: 'assistant', type: 'text', data: null, action: null,
      text: `Hi ${firstName}! 👋 How can I help you today?`,
      timestamp: new Date(),
    }])
    setConversationHistory([])
    setChatState('idle')
    sessionStorage.removeItem(`chatbot_${sessionId}`)
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Chat window */}
      {open && !minimized && (
        <div className="w-[380px] max-w-[calc(100vw-3rem)] bg-white rounded-2xl shadow-2xl border border-zinc-200 flex flex-col overflow-hidden"
          style={{ height: '520px' }}>

          {/* Header */}
          <div className="bg-[#E31837] px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-black">SB</span>
              </div>
              <div>
                <p className="text-white font-black text-sm">SigBot 🚗</p>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-white/80 text-xs font-bold">Online · AI Booking Assistant</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={clearChat} className="text-white/70 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition text-xs font-bold" title="Clear chat">
                Clear
              </button>
              <button onClick={() => setMinimized(true)} className="text-white/70 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition">
                <Minus size={16} />
              </button>
              <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-1 bg-zinc-50">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                onSelectVehicle={handleSelectVehicle}
                onConfirmBooking={handleConfirmBooking}
                onChangeBooking={handleChangeBooking}
                onPayNow={handlePayNow}
                onCancelBooking={handleCancelBooking}
                onConfirmCancellation={handleConfirmCancellation}
                onKeepBooking={handleKeepBooking}
              />
            ))}
            {isLoading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick replies */}
          <div className="px-3 py-2 flex gap-2 overflow-x-auto flex-shrink-0 bg-white border-t border-zinc-100"
            style={{ scrollbarWidth: 'none' }}>
            {quickReplies.map((chip) => (
              <button
                key={chip}
                onClick={() => sendMessage(chip)}
                disabled={isLoading}
                className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-black text-zinc-700 hover:border-[#E31837] hover:text-[#E31837] transition disabled:opacity-50"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-zinc-100 bg-white flex-shrink-0">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                rows={1}
                disabled={isLoading}
                className="flex-1 resize-none rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-[#E31837] focus:ring-1 focus:ring-[#E31837] disabled:opacity-50 max-h-24"
                style={{ lineHeight: '1.4' }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!inputText.trim() || isLoading}
                className="w-10 h-10 bg-[#E31837] rounded-xl flex items-center justify-center text-white hover:bg-red-700 transition disabled:opacity-40 flex-shrink-0"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Minimized bar */}
      {open && minimized && (
        <button
          onClick={() => setMinimized(false)}
          className="bg-[#E31837] text-white rounded-full px-5 py-3 shadow-xl flex items-center gap-3 hover:bg-red-700 transition"
        >
          <MessageCircle size={18} />
          <span className="font-black text-sm">SigBot</span>
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        </button>
      )}

      {/* Floating bubble */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="relative w-14 h-14 bg-[#E31837] rounded-full shadow-xl flex items-center justify-center hover:bg-red-700 transition hover:scale-110"
          aria-label="Open SigBot"
        >
          <MessageCircle className="text-white" size={24} />
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-white animate-pulse" />
        </button>
      )}
    </div>
  )
}
