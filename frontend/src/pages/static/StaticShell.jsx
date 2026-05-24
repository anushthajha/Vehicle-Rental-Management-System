import React from 'react'
import * as Accordion from '@radix-ui/react-accordion'
import { Link } from 'react-router-dom'
import { Check, ChevronDown } from 'lucide-react'
import Navbar from '../../components/layout/Navbar'

export function PublicShell({ children }) {
  return <main className="min-h-screen bg-[#F9FAFB] text-[#111827]"><Navbar />{children}<Footer /></main>
}

export function PageHero({ eyebrow, title, subtitle, image }) {
  return <section className="relative overflow-hidden bg-[#111827] px-4 pb-20 pt-32 text-white"><img src={image || 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=1600'} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" /><div className="absolute inset-0 bg-gradient-to-r from-black/80 to-black/30" /><div className="relative mx-auto max-w-7xl"><p className="text-sm font-black uppercase tracking-[0.2em] text-orange-200">{eyebrow}</p><h1 className="font-display mt-4 max-w-4xl text-4xl font-black md:text-6xl">{title}</h1>{subtitle && <p className="mt-5 max-w-2xl text-lg font-semibold text-white/80">{subtitle}</p>}</div></section>
}

export function Section({ title, subtitle, children, className = '' }) {
  return <section className={`px-4 py-16 ${className}`}><div className="mx-auto max-w-7xl"><div className="mb-8"><h2 className="font-display text-3xl font-black md:text-4xl">{title}</h2>{subtitle && <p className="mt-3 max-w-3xl text-lg font-semibold text-zinc-600">{subtitle}</p>}</div>{children}</div></section>
}

export function Flow({ items }) {
  return <div className="grid gap-4 md:grid-cols-3">{items.map((item, index) => <div key={item.title} className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"><span className="grid h-11 w-11 place-items-center rounded-full bg-[#E31837] font-display text-lg font-black text-white">{index + 1}</span><h3 className="mt-4 font-black">{item.title}</h3><p className="mt-2 text-sm font-semibold text-zinc-600">{item.text}</p></div>)}</div>
}

export function FeatureGrid({ items }) {
  return <div className="grid gap-4 md:grid-cols-4">{items.map((item) => <div key={item.title} className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"><Check className="text-[#E31837]" /><h3 className="mt-4 font-black">{item.title}</h3><p className="mt-2 text-sm font-semibold text-zinc-600">{item.text}</p></div>)}</div>
}

export function FAQBlock({ items }) {
  return <Accordion.Root type="single" collapsible className="space-y-3">{items.map(([q, a]) => <Accordion.Item key={q} value={q} className="rounded-lg border border-zinc-200 bg-white px-5"><Accordion.Trigger className="flex w-full items-center justify-between py-4 text-left font-black">{q}<ChevronDown size={18} /></Accordion.Trigger><Accordion.Content className="pb-4 font-semibold text-zinc-600">{a}</Accordion.Content></Accordion.Item>)}</Accordion.Root>
}

export function CTA({ title = 'Ready to drive?', to = '/vehicles', label = 'Explore cars' }) {
  return <section className="px-4 py-16"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 rounded-lg bg-gradient-to-r from-[#E31837] to-[#FF6B35] p-8 text-white"><h2 className="font-display text-3xl font-black">{title}</h2><Link to={to} className="rounded-md bg-white px-5 py-3 font-black text-[#E31837]">{label}</Link></div></section>
}

function Footer() {
  return <footer className="border-t border-zinc-200 bg-white px-4 py-10"><div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-[1fr_auto]"><div><Link to="/" className="font-display text-2xl font-black"><span className="text-[#E31837]">Zoom</span>car</Link><p className="mt-2 max-w-xl text-sm font-semibold text-zinc-500">A full-stack clone for self-drive car rentals, manager earnings, wallet payments, KYC, support, and admin operations.</p></div><div className="flex flex-wrap gap-4 text-sm font-black text-zinc-700"><Link to="/terms">Terms</Link><Link to="/privacy">Privacy</Link><Link to="/refund-policy">Refunds</Link><Link to="/contact">Contact</Link></div></div></footer>
}

export const guestFlow = [
  { title: 'Search', text: 'Pick your city, trip dates, and preferred car category.' },
  { title: 'Select', text: 'Compare verified manager cars by price, rating, location, and features.' },
  { title: 'KYC', text: 'Upload identity and driving documents for secure approval.' },
  { title: 'Book', text: 'Pay securely through wallet or simulated payment methods.' },
  { title: 'Pickup', text: 'Meet the manager, inspect the car, and start your trip.' },
  { title: 'Return', text: 'Return on time, settle extras, and review the experience.' },
]

export const managerFlow = [
  { title: 'Register', text: 'Create a manager account and complete profile verification.' },
  { title: 'Photos', text: 'Upload clear car photos and ownership details.' },
  { title: 'Pricing', text: 'Set day/hour prices, limits, and availability blocks.' },
  { title: 'Receive bookings', text: 'Approve suitable guests and manage requests.' },
  { title: 'Meet guest', text: 'Complete pickup inspection and hand over keys.' },
  { title: 'Earn', text: 'Get earnings credited after trip completion and request payouts.' },
]
