import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { CTA, FAQBlock, FeatureGrid, Flow, PageHero, PublicShell, Section } from './static/StaticShell'

const rates = { hatchback: 550, sedan: 750, suv: 1050, luxury: 2500, electric: 850 }

export default function BecomeManagerPage() {
  const [days, setDays] = useState(15)
  const [category, setCategory] = useState('sedan')
  const estimated = Math.round(days * rates[category] * 0.85)
  return <PublicShell><PageHero eyebrow="Become a manager" title="Turn your vehicle into a business" subtitle="List free, approve every booking, and withdraw earnings to your bank account." /><Section title="How much can you earn?"><div className="grid gap-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm lg:grid-cols-2"><div><label className="font-black">Days per month: {days}<input type="range" min="5" max="25" value={days} onChange={(e) => setDays(Number(e.target.value))} className="mt-4 w-full accent-[#E31837]" /></label><label className="mt-5 block font-black">Vehicle category<select className="input mt-2" value={category} onChange={(e) => setCategory(e.target.value)}>{Object.keys(rates).map((key) => <option key={key} value={key}>{key}</option>)}</select></label></div><div className="rounded-lg bg-[#111827] p-6 text-white"><p className="font-bold text-white/70">Estimated monthly earnings</p><p className="font-display mt-2 text-5xl font-black">₹{estimated.toLocaleString('en-IN')}</p><Link to="/manager/vehicles/add" className="mt-5 inline-flex rounded-md bg-[#E31837] px-5 py-3 font-black text-white">Start Earning Free</Link></div></div></Section><Section title="Requirements"><FeatureGrid items={[{ title: 'Valid DL', text: 'Manager identity and license information must be verified.' }, { title: 'KYC', text: 'Complete account verification before listing.' }, { title: 'Vehicle under 10 years', text: 'Vehicles should be roadworthy, clean, and recently serviced.' }, { title: 'Clean record', text: 'No unresolved ownership or safety disputes.' }]} /></Section><Section title="Step-by-step"><Flow items={['Register', 'KYC', 'Add Vehicle', 'Get approved', 'Earn'].map((title) => ({ title, text: `${title} through the guided manager workflow.` }))} /></Section><Section title="Protection for managers"><FeatureGrid items={[{ title: 'GPS device', text: 'Track active trips and resolve route issues.' }, { title: 'Insurance', text: 'Coverage tiers and deposits reduce uncertainty.' }, { title: 'Verified customers', text: 'Customers complete KYC before booking.' }]} /></Section><Section title="Manager FAQ"><FAQBlock items={faq} /></Section><CTA title="Ready to start earning?" to="/manager/vehicles/add" label="Start Earning Free" /></PublicShell>
}

const faq = [
  ['Does listing cost money?', 'No. You can list your vehicle free and pay platform fees through completed bookings.'],
  ['Can I reject bookings?', 'Yes. Managers can approve or reject trip requests depending on availability and fit.'],
  ['When do I get paid?', 'Earnings are credited after trip completion and can be requested as payouts.'],
  ['What if a customer damages my vehicle?', 'Report it immediately with photos. The claim is reviewed against the chosen insurance tier.'],
  ['Can I pause my listing?', 'Yes. Toggle availability or block dates from your manager vehicle management pages.'],
]
