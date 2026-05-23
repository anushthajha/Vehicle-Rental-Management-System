import React from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/layout/Navbar'

export default function NotFoundPage() {
  return <main className="min-h-screen bg-[#F9FAFB]"><Navbar /><section className="grid min-h-screen place-items-center px-4 pt-24 text-center"><div><svg viewBox="0 0 360 160" className="mx-auto h-40 w-80 text-zinc-300"><path d="M20 130 C90 80 130 80 190 130 S280 180 340 100" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeDasharray="18 18" /><circle cx="260" cy="78" r="20" fill="#E31837" /></svg><h1 className="font-display text-8xl font-black text-[#111827]">404</h1><p className="mt-3 text-xl font-black">Looks like this road leads nowhere.</p><Link to="/" className="mt-6 inline-flex rounded-md bg-[#E31837] px-5 py-3 font-black text-white">Take Me Home</Link></div></section></main>
}
