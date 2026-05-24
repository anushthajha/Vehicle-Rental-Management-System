import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
})

api.interceptors.response.use(
  (response) => {
    const payload = response.data
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return Object.assign(payload, { data: payload })
    }
    return payload
  },
  (error) => {
    const errorData = error.response?.data
    const message = errorData?.error?.message
      || errorData?.detail?.message
      || errorData?.detail
      || 'Something went wrong. Please try again.'
    const code = errorData?.error?.code
    const details = errorData?.error?.details

    if (code === 'FORBIDDEN' && typeof window !== 'undefined' && window.location.pathname !== '/unauthorized') {
      window.location.assign('/unauthorized')
    }

    throw {
      message,
      code,
      details,
      status: error.response?.status,
      config: error.config,
      response: error.response,
      originalError: error,
    }
  },
)

export default api
