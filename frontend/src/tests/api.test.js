import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'

import api from '../services/api'

const originalAdapter = api.defaults.adapter

function mockSuccess(data = {}) {
  api.defaults.adapter = vi.fn(async (config) => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  }))
}

function mockError(status) {
  api.defaults.adapter = vi.fn(async (config) => {
    throw Object.assign(
      new Error(`HTTP ${status}`),
      {
        config,
        response: {
          status,
          data: {
            detail: 'Test error',
          },
          config,
        },
      }
    )
  })
}

describe('API interceptors', () => {
  let onExpired

  beforeEach(() => {
    localStorage.clear()

    onExpired = vi.fn()

    window.addEventListener(
      'auth:expired',
      onExpired
    )
  })

  afterEach(() => {
    api.defaults.adapter = originalAdapter

    window.removeEventListener(
      'auth:expired',
      onExpired
    )

    localStorage.clear()
  })

  it('uses the correct API base URL', () => {
    expect(api.defaults.baseURL).toBe('/api')
  })

  it('attaches the stored token to protected requests', async () => {
    localStorage.setItem(
      'access_token',
      'test-token'
    )

    mockSuccess()

    await api.get('/equipment')

    const config =
      api.defaults.adapter.mock.calls[0][0]

    expect(config.headers.Authorization)
      .toBe('Bearer test-token')
  })

  it('does not attach authorization without a token', async () => {
    mockSuccess()

    await api.get('/equipment')

    const config =
      api.defaults.adapter.mock.calls[0][0]

    expect(config.headers.Authorization)
      .toBeUndefined()
  })

  it.each([
    '/login',
    '/register',
  ])(
    'does not attach the stored token to %s',
    async (endpoint) => {
      localStorage.setItem(
        'access_token',
        'test-token'
      )

      mockSuccess()

      await api.post(endpoint, {})

      const config =
        api.defaults.adapter.mock.calls[0][0]

      expect(config.headers.Authorization)
        .toBeUndefined()
    }
  )

  it('returns successful responses normally', async () => {
    const data = {
      total: 10,
    }

    mockSuccess(data)

    const response = await api.get('/dashboard')

    expect(response.status).toBe(200)
    expect(response.data).toEqual(data)
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('preserves the token after a successful request', async () => {
    localStorage.setItem(
      'access_token',
      'valid-token'
    )

    mockSuccess()

    await api.get('/users/me')

    expect(
      localStorage.getItem('access_token')
    ).toBe('valid-token')

    expect(onExpired).not.toHaveBeenCalled()
  })

  it('clears the current token after a protected 401 response', async () => {
    localStorage.setItem(
      'access_token',
      'expired-token'
    )

    mockError(401)

    await expect(
      api.get('/dashboard')
    ).rejects.toThrow('HTTP 401')

    expect(
      localStorage.getItem('access_token')
    ).toBeNull()

    expect(onExpired).toHaveBeenCalledTimes(1)
  })

  it.each([
    '/login',
    '/register',
  ])(
    'preserves the session after a 401 from %s',
    async (endpoint) => {
      localStorage.setItem(
        'access_token',
        'existing-token'
      )

      mockError(401)

      await expect(
        api.post(endpoint, {})
      ).rejects.toThrow('HTTP 401')

      expect(
        localStorage.getItem('access_token')
      ).toBe('existing-token')

      expect(onExpired).not.toHaveBeenCalled()
    }
  )

  it('does not dispatch logout when no token exists', async () => {
    mockError(401)

    await expect(
      api.get('/equipment')
    ).rejects.toThrow('HTTP 401')

    expect(onExpired).not.toHaveBeenCalled()
  })

  it('preserves a new session after an old request fails', async () => {
    localStorage.setItem(
      'access_token',
      'old-token'
    )

    api.defaults.adapter = vi.fn(
      async (config) => {
        localStorage.setItem(
          'access_token',
          'new-token'
        )

        throw Object.assign(
          new Error('Old request failed'),
          {
            config,
            response: {
              status: 401,
              config,
            },
          }
        )
      }
    )

    await expect(
      api.get('/equipment')
    ).rejects.toThrow('Old request failed')

    expect(
      localStorage.getItem('access_token')
    ).toBe('new-token')

    expect(onExpired).not.toHaveBeenCalled()
  })

  it('dispatches logout only once for concurrent 401 responses', async () => {
    localStorage.setItem(
      'access_token',
      'expired-token'
    )

    mockError(401)

    const results = await Promise.allSettled([
      api.get('/dashboard'),
      api.get('/equipment'),
      api.get('/laboratories'),
    ])

    expect(
      results.every(
        (result) => result.status === 'rejected'
      )
    ).toBe(true)

    expect(
      localStorage.getItem('access_token')
    ).toBeNull()

    expect(onExpired).toHaveBeenCalledTimes(1)
  })

  it.each([
    400,
    403,
    404,
    409,
    422,
    429,
    500,
  ])(
    'preserves the session after HTTP %s',
    async (status) => {
      localStorage.setItem(
        'access_token',
        'valid-token'
      )

      mockError(status)

      await expect(
        api.get('/equipment')
      ).rejects.toThrow(`HTTP ${status}`)

      expect(
        localStorage.getItem('access_token')
      ).toBe('valid-token')

      expect(onExpired).not.toHaveBeenCalled()
    }
  )

  it('preserves the session after a network error', async () => {
    localStorage.setItem(
      'access_token',
      'valid-token'
    )

    api.defaults.adapter = vi.fn(async () => {
      throw new Error('Network Error')
    })

    await expect(
      api.get('/dashboard')
    ).rejects.toThrow('Network Error')

    expect(
      localStorage.getItem('access_token')
    ).toBe('valid-token')

    expect(onExpired).not.toHaveBeenCalled()
  })

  it('propagates the original API error', async () => {
    const originalError = new Error(
      'Original API error'
    )

    api.defaults.adapter = vi.fn(async () => {
      throw originalError
    })

    await expect(
      api.get('/dashboard')
    ).rejects.toBe(originalError)
  })
})
