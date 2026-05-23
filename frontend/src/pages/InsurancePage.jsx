import React from 'react'
import { CTA, PageHero, PublicShell, Section } from './static/StaticShell'

const rows = [
  ['Own Damage', '₹10,000', '₹5,000', '₹0'],
  ['Third Party', '✓', '✓', '✓'],
  ['Theft', '✗', '✓', '✓'],
  ['Roadside Assistance', '✗', '✗', '✓'],
  ['Zero Depreciation', '✗', '✗', '✓'],
]

export default function InsurancePage() {
  return <PublicShell><PageHero eyebrow="Insurance" title="Choose coverage that matches your trip" subtitle="Basic, Standard, and Platinum plans set clear excess amounts before you drive." /><Section title="Coverage comparison"><div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm"><table className="w-full min-w-[720px] text-left"><thead className="bg-zinc-50"><tr><th className="p-4">Feature</th><th className="p-4">Basic (5%)</th><th className="p-4">Standard (8%)</th><th className="p-4">Platinum (12%)</th></tr></thead><tbody>{rows.map((row) => <tr key={row[0]} className="border-t border-zinc-100">{row.map((cell) => <td key={cell} className="p-4 font-bold">{cell}</td>)}</tr>)}</tbody></table></div></Section><Section title="Excess and claims" subtitle="The excess is the maximum out-of-pocket liability for eligible own-damage claims under your selected tier. Claims require immediate reporting, inspection photos, trip records, and cooperation from guest and host. Security deposits can be held while a claim is reviewed. Roadside assistance and zero-depreciation benefits apply only on eligible Platinum incidents." /><CTA title="Need a car with better coverage?" /></PublicShell>
}
