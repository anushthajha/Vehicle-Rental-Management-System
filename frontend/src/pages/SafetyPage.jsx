import React from 'react'
import { CTA, FeatureGrid, PageHero, PublicShell, Section } from './static/StaticShell'

export default function SafetyPage() {
  return <PublicShell><PageHero eyebrow="Safety" title="Trust systems for every trip" subtitle="Verification, monitoring, support, and insurance all work together to protect customers and managers." /><Section title="KYC verification"><p className="max-w-4xl text-lg font-semibold text-zinc-600">Customers submit license and Aadhaar details for admin review. Managers can see verified status before accepting trips, and suspicious documents can be rejected with a clear reason.</p></Section><Section title="Trip monitoring and support"><FeatureGrid items={[{ title: 'Trip timeline', text: 'Pickup, active trip, return, and completion states are tracked.' }, { title: 'Emergency support', text: 'Support tickets and staff replies are available for urgent issues.' }, { title: 'Insurance coverage', text: 'Liability limits are clear before payment.' }, { title: 'Bad actor reporting', text: 'Support records and admin tools help investigate violations.' }]} /></Section><CTA title="Drive with confidence" /></PublicShell>
}
