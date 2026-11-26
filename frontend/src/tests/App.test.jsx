import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import App from '../App'

vi.mock('../pages/Dashboard', () => ({
  default: () => <h1>Dashboard Page</h1>,
}))

vi.mock('../pages/Laboratories', () => ({
  default: () => <h1>Laboratories Page</h1>,
}))

vi.mock('../pages/Equipment', () => ({
  default: () => <h1>Equipment Page</h1>,
}))

vi.mock('../pages/Maintenance', () => ({
  default: () => <h1>Maintenance Page</h1>,
}))

vi.mock('../pages/Settings', () => ({
  default: ({ onLogout }) => (
    <div>
      <h1>Settings Page</h1>

      <button onClick={onLogout}>
        Çıkış Yap
      </button>
    </div>
  ),
}))

vi.mock('../pages/Auth', () => ({
  default: ({ onLogin }) => (
    <div>
      <h1>Login Page</h1>

      <button
        onClick={() => {
          localStorage.setItem(
            'access_token',
            'mock-access-token'
          )

          onLogin()
        }}
      >
        Giriş Yap
      </button>
    </div>
  ),
}))

function renderApp(path = '/', authenticated = false) {
  window.history.replaceState({}, '', path)

  if (authenticated) {
    localStorage.setItem(
      'access_token',
      'mock-access-token'
    )
  }

  const user = userEvent.setup()
  const view = render(<App />)

  return { user, ...view }
}

describe('App authentication and navigation', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  it.each([
    '/',
    '/laboratories',
    '/equipment',
    '/maintenance',
    '/settings',
  ])(
    'redirects unauthenticated users from %s to login',
    async (path) => {
      renderApp(path)

      expect(
        await screen.findByRole('heading', {
          name: 'Login Page',
        })
      ).toBeInTheDocument()

      expect(window.location.pathname).toBe('/login')

      expect(
        screen.queryByRole('navigation')
      ).not.toBeInTheDocument()
    }
  )

  it('allows authenticated users to access dashboard', () => {
    renderApp('/', true)

    expect(
      screen.getByRole('heading', {
        name: 'Dashboard Page',
      })
    ).toBeInTheDocument()
  })

  it('redirects authenticated users away from login', async () => {
    renderApp('/login', true)

    expect(
      await screen.findByRole('heading', {
        name: 'Dashboard Page',
      })
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/')
  })

  it('updates authentication state after login', async () => {
    const { user } = renderApp('/login')

    await user.click(
      screen.getByRole('button', {
        name: 'Giriş Yap',
      })
    )

    expect(
      await screen.findByRole('heading', {
        name: 'Dashboard Page',
      })
    ).toBeInTheDocument()

    expect(
      localStorage.getItem('access_token')
    ).toBe('mock-access-token')
  })

  it('restores authentication state after remounting', () => {
    const { unmount } = renderApp('/', true)

    unmount()

    render(<App />)

    expect(
      screen.getByRole('heading', {
        name: 'Dashboard Page',
      })
    ).toBeInTheDocument()
  })

  it.each([
    ['Laboratuvarlar', 'Laboratories Page', '/laboratories'],
    ['Ekipmanlar', 'Equipment Page', '/equipment'],
    ['Bakım Takibi', 'Maintenance Page', '/maintenance'],
    ['Ayarlar', 'Settings Page', '/settings'],
  ])(
    'navigates to %s using the sidebar',
    async (linkName, heading, path) => {
      const { user } = renderApp('/', true)

      const link = screen.getByRole('link', {
        name: new RegExp(linkName),
      })

      await user.click(link)

      expect(
        await screen.findByRole('heading', {
          name: heading,
        })
      ).toBeInTheDocument()

      expect(window.location.pathname).toBe(path)
      expect(link).toHaveClass('active')
      expect(link).toHaveAttribute('aria-current', 'page')
    }
  )

  it('returns to dashboard using the sidebar', async () => {
    const { user } = renderApp('/equipment', true)

    await user.click(
      screen.getByRole('link', {
        name: /Dashboard/,
      })
    )

    expect(
      await screen.findByRole('heading', {
        name: 'Dashboard Page',
      })
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/')
  })

  it('redirects unknown routes to dashboard', async () => {
    renderApp('/unknown-page', true)

    expect(
      await screen.findByRole('heading', {
        name: 'Dashboard Page',
      })
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/')
  })

  it('removes the token and redirects after logout', async () => {
    const { user } = renderApp('/settings', true)

    await user.click(
      screen.getByRole('button', {
        name: 'Çıkış Yap',
      })
    )

    expect(
      await screen.findByRole('heading', {
        name: 'Login Page',
      })
    ).toBeInTheDocument()

    expect(
      localStorage.getItem('access_token')
    ).toBeNull()

    expect(window.location.pathname).toBe('/login')

    expect(
      screen.queryByRole('navigation')
    ).not.toBeInTheDocument()
  })
})


describe('App session expiration', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  function expireSession() {
    act(() => {
      localStorage.removeItem('access_token')

      window.dispatchEvent(
        new CustomEvent('auth:expired')
      )
    })
  }

  it.each([
    '/',
    '/laboratories',
    '/equipment',
    '/maintenance',
    '/settings',
  ])(
    'redirects to login after session expiration on %s',
    async (path) => {
      renderApp(path, true)

      expireSession()

      expect(
        await screen.findByRole('heading', {
          name: 'Login Page',
        })
      ).toBeInTheDocument()

      expect(window.location.pathname).toBe('/login')

      expect(
        localStorage.getItem('access_token')
      ).toBeNull()

      expect(
        screen.queryByRole('navigation')
      ).not.toBeInTheDocument()
    }
  )

  it('prevents protected access after session expiration', async () => {
    const { unmount } = renderApp('/equipment', true)

    expireSession()

    unmount()

    renderApp('/maintenance')

    expect(
      await screen.findByRole('heading', {
        name: 'Login Page',
      })
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/login')
  })

  it('allows login again after session expiration', async () => {
    const { user } = renderApp('/', true)

    expireSession()

    await user.click(
      await screen.findByRole('button', {
        name: 'Giriş Yap',
      })
    )

    expect(
      await screen.findByRole('heading', {
        name: 'Dashboard Page',
      })
    ).toBeInTheDocument()

    expect(
      localStorage.getItem('access_token')
    ).toBe('mock-access-token')

    expect(window.location.pathname).toBe('/')
  })

  it('handles repeated session expiration events', async () => {
    renderApp('/', true)

    expireSession()
    expireSession()
    expireSession()

    expect(
      await screen.findByRole('heading', {
        name: 'Login Page',
      })
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/login')
  })

  it('handles expiration when already logged out', async () => {
    renderApp('/login')

    expireSession()

    expect(
      await screen.findByRole('heading', {
        name: 'Login Page',
      })
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/login')
  })

  it('removes the session event listener on unmount', () => {
    const addListener = vi.spyOn(
      window,
      'addEventListener'
    )

    const removeListener = vi.spyOn(
      window,
      'removeEventListener'
    )

    const { unmount } = renderApp('/', true)

    const registration = addListener.mock.calls.find(
      ([eventName]) => eventName === 'auth:expired'
    )

    expect(registration).toBeDefined()

    const handler = registration[1]

    unmount()

    expect(removeListener).toHaveBeenCalledWith(
      'auth:expired',
      handler
    )
  })
})
