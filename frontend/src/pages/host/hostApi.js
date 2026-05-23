import api from '../../services/api'

export async function getHost(path, params = {}) {
  const response = await api.get(`/host${path}`, { params })
  return response.data
}

export async function postHost(path, body = {}) {
  const response = await api.post(`/host${path}`, body)
  return response.data
}

export async function patchHost(path, body = {}) {
  const response = await api.patch(`/host${path}`, body)
  return response.data
}

export function money(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0))
}

export function dateLabel(value) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value))
}

export function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
