import api from '../../services/api'

export async function getAdmin(path, params = {}) {
  const response = await api.get(`/admin${path}`, { params })
  return response.data
}

export async function postAdmin(path, body = {}) {
  const response = await api.post(`/admin${path}`, body)
  return response.data
}

export async function patchAdmin(path, body = {}) {
  const response = await api.patch(`/admin${path}`, body)
  return response.data
}

export async function deleteAdmin(path) {
  const response = await api.delete(`/admin${path}`)
  return response.data
}

export function formatMoney(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0))
}

export function formatDate(value) {
  if (!value) return 'Not set'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function initials(name = 'Admin') {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
