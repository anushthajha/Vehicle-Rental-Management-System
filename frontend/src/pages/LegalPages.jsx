import React from 'react'
import { PageHero, PublicShell, Section } from './static/StaticShell'

function Legal({ eyebrow, title, intro, sections }) {
  return <PublicShell><PageHero eyebrow={eyebrow} title={title} subtitle={intro} /><Section title={title}><div className="space-y-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">{sections.map(([h, p]) => <article key={h}><h2 className="font-display text-2xl font-black">{h}</h2><p className="mt-2 whitespace-pre-line font-semibold leading-7 text-zinc-600">{p}</p></article>)}</div></Section></PublicShell>
}

export function TermsPage() {
  return <Legal eyebrow="Terms" title="Terms of Service" intro="Realistic platform rules for guests, managers, payments, and acceptable use." sections={[
    ['User eligibility', 'Users must be legally able to contract, provide accurate information, and hold valid driving credentials where required. Accounts may be suspended for false documents or unsafe conduct.'],
    ['Booking rules', 'Guests must pick up and return cars on time, follow traffic laws, keep the vehicle clean, and avoid unauthorized drivers, racing, towing, commercial carriage, or illegal activity.'],
    ['Cancellation policy', 'Cancellations may create fees based on timing, manager preparation, and payment status. Manager cancellations can affect acceptance metrics and super manager eligibility.'],
    ['Damage liability', 'Guests are responsible for damage, fines, tolls, missing fuel, late return costs, and claims not covered by the selected insurance tier. Deposits can be held during investigation.'],
    ['Payment terms', 'Wallet credits, simulated card/UPI payments, refunds, manager earnings, platform fees, and payout holds are recorded in platform ledgers.'],
    ['Manager responsibilities', 'Managers must provide roadworthy cars, accurate listings, valid ownership details, clean interiors, timely handover, and truthful condition reporting.'],
    ['Prohibited uses', 'No illegal transport, subletting, off-road abuse without permission, tampering with tracking, harassment, payment circumvention, or data scraping.'],
  ]} />
}

export function PrivacyPage() {
  return <Legal eyebrow="Privacy" title="Privacy Policy" intro="How the clone collects, uses, shares, and protects platform data." sections={[
    ['Data collection', 'We collect profile details, contact information, KYC documents, booking records, payment ledger data, support messages, car listings, reviews, and usage analytics.'],
    ['Usage', 'Data is used to verify identity, process bookings, calculate pricing, manage payouts, prevent abuse, personalize search, send notifications, and improve operations.'],
    ['Sharing', 'Relevant trip details are shared between guest and manager. Admins can access operational data. Service providers may process email, storage, analytics, and infrastructure events.'],
    ['Security', 'Access controls, token authentication, rate limits, and separated SQL/Mongo stores reduce risk, but users should protect passwords and devices.'],
    ['Cookies', 'Local storage and browser cookies may keep authentication state, preferences, search state, and analytics identifiers.'],
    ['Rights', 'Users can request profile updates, account review, support history, and deletion where operational/legal retention allows.'],
  ]} />
}

export function RefundPage() {
  return <Legal eyebrow="Refunds" title="Refund Policy" intro="Cancellation tiers, wallet timelines, deposits, and insurance claim treatment." sections={[
    ['Cancellation tiers', 'Early cancellations generally receive larger refunds. Close-to-pickup or no-show cancellations may retain platform fees or manager compensation.'],
    ['Refund timeline', 'Wallet refunds are instant after processing. Simulated card/UPI refunds are recorded immediately in this clone but may represent 3-7 business days in real systems.'],
    ['Damage deposits', 'Security deposits are released after trip completion unless there are damage, toll, fuel, late return, or claim investigations.'],
    ['Insurance claims', 'If damage is reported, claim review determines excess liability according to Basic, Standard, or Platinum coverage.'],
    ['Manual refunds', 'Admins may issue manual wallet refunds for service failures, duplicate payments, or approved exceptions.'],
  ]} />
}
