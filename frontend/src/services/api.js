import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

function isPublicEndpoint(url) {
  return url === '/login' || url === '/register'
}

// Request interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')

  if (token && !isPublicEndpoint(config.url)) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

// Response interceptor
api.interceptors.response.use(
  (response) => response,

  (error) => {
    const status = error.response?.status
    const request = error.config

    if (
      status === 401 &&
      request &&
      !isPublicEndpoint(request.url)
    ) {
      const currentToken = localStorage.getItem('access_token')
      const requestAuthorization =
        request.headers?.Authorization

      if (
        currentToken &&
        requestAuthorization === `Bearer ${currentToken}`
      ) {
        localStorage.removeItem('access_token')

        window.dispatchEvent(
          new CustomEvent('auth:expired')
        )
      }
    }

    return Promise.reject(error)
  }
)

export default api
