import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,   // Send HttpOnly cookies (refresh token) with every request
})

// Response interceptor — pass successful responses through unchanged.
// For errors, enrich the thrown object but PRESERVE the original Axios
// error shape (error.response, error.config, error.status) so that the
// AuthContext 401-retry interceptor can still detect and handle them.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const errorData = error.response?.data
    const message =
      errorData?.error?.message ||
      (typeof errorData?.detail === 'string' ? errorData.detail : null) ||
      errorData?.detail?.message ||
      error.message ||
      'Something went wrong. Please try again.'
    const code = errorData?.error?.code
    const details = errorData?.error?.details

    if (
      code === 'FORBIDDEN' &&
      typeof window !== 'undefined' &&
      window.location.pathname !== '/unauthorized'
    ) {
      window.location.assign('/unauthorized')
    }

    // Attach friendly fields to the original Axios error so callers can
    // read err.message / err.code / err.details, while AuthContext can
    // still read err.response?.status for 401 detection.
    error.message = message
    error.code = code
    error.details = details
    error.status = error.response?.status ?? error.status

    return Promise.reject(error)
  },
)

export default api
