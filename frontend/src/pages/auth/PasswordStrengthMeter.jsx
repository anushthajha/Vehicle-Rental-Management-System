import React from 'react'

export function getPasswordStrength(password) {
  if (!password || password.length < 8) return { label: 'Too Weak', percent: 25, color: 'bg-red-500' }
  const hasSpecial = /[!@#$%^&*]/.test(password)
  const hasNumber = /\d/.test(password)
  const hasUpper = /[A-Z]/.test(password)
  if (!hasSpecial || !hasNumber || !hasUpper) return { label: 'Weak', percent: 45, color: 'bg-amber-500' }
  if (password.length > 10) return { label: 'Strong', percent: 100, color: 'bg-emerald-600' }
  return { label: 'Good', percent: 75, color: 'bg-lime-600' }
}

export default function PasswordStrengthMeter({ password }) {
  const strength = getPasswordStrength(password)
  return (
    <div className="mt-2">
      <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
        <div className={`h-full ${strength.color}`} style={{ width: `${strength.percent}%` }} />
      </div>
      <p className="mt-1 text-xs font-semibold text-zinc-500">{strength.label}</p>
    </div>
  )
}
