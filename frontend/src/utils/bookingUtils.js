import { formatDuration, formatMoney } from './searchData'

export function formatDateTime(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export function bookingDuration(booking) {
  return formatDuration(booking.pickup_datetime, booking.return_datetime)
}

export function statusClass(status) {
  const map = {
    pending: 'bg-amber-100 text-amber-800',
    confirmed: 'bg-emerald-100 text-emerald-800',
    active: 'bg-blue-100 text-blue-800',
    completed: 'bg-zinc-900 text-white',
    cancelled: 'bg-red-100 text-red-800',
    rejected: 'bg-zinc-200 text-zinc-700',
  }
  return map[status] || 'bg-zinc-100 text-zinc-700'
}

export function priceLines(breakdown = {}) {
  return [
    ['Base amount', breakdown.base_amount],
    ['Rule discount', breakdown.discount_from_rules ? -breakdown.discount_from_rules : 0],
    ['Coupon discount', breakdown.coupon_discount ? -breakdown.coupon_discount : 0],
    ['Insurance', breakdown.insurance_amount],
    ['Platform fee', breakdown.platform_fee],
  ].filter(([, value]) => Number(value || 0) !== 0)
}

export function moneyLabel(value) {
  return `₹${formatMoney(value)}`
}
