import React from 'react'
import { CTA, FAQBlock, FeatureGrid, Flow, guestFlow, managerFlow, PageHero, PublicShell, Section } from './static/StaticShell'

export default function HowItWorksPage() {
  return <PublicShell><PageHero eyebrow="How it works" title="Self-drive rentals without the guesswork" subtitle="From discovery to return, every step is built around verified people, secure payments, and clear trip rules." /><Section title="For Guests" subtitle="Six simple steps from search to return."><Flow items={guestFlow} /></Section><Section title="For Managers" subtitle="Turn an idle car into a managed earning asset."><Flow items={managerFlow} /></Section><Section title="Built-in safeguards"><FeatureGrid items={[{ title: 'GPS tracking', text: 'Trip metadata helps resolve route and timing disputes.' }, { title: 'KYC checks', text: 'Guests submit identity and license documents before booking.' }, { title: 'Insurance choices', text: 'Every booking includes an insurance tier and liability limit.' }, { title: '24/7 support', text: 'Support tickets and staff replies are built into the platform.' }]} /></Section><Section title="FAQ"><FAQBlock items={faq} /></Section><CTA /></PublicShell>
}

const faq = [
  ['Can I book immediately?', 'Some cars auto-accept, while others require manager approval. You will see status updates in My Bookings.'],
  ['Who manages pickup?', 'The manager and guest coordinate pickup at the listed location. The booking detail page carries trip information.'],
  ['How do payouts work?', 'Manager earnings are credited after trip completion and can be withdrawn through the payouts page.'],
]
