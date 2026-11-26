import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

import Auth from '../pages/Auth'
import api from '../services/api'

vi.mock('../services/api', () => ({
  default: {
    post: vi.fn(),
  },
}))

function renderAuth() {
  const onLogin = vi.fn()
  const user = userEvent.setup()

  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route
          path="/login"
          element={<Auth onLogin={onLogin} />}
        />
        <Route
          path="/"
          element={<h1>Dashboard</h1>}
        />
      </Routes>
    </MemoryRouter>
  )

  return { user, onLogin }
}

async function fillForm(user) {
  await user.type(
    screen.getByLabelText('E-posta'),
    'test@example.com'
  )

  await user.type(
    screen.getByLabelText('Şifre'),
    'TestPassword123'
  )
}

describe('Auth component', () => {
  beforeEach(() => {
    api.post.mockReset()
  })

  it('renders the login form', () => {
    renderAuth()

    expect(
      screen.getByRole('heading', { name: 'Hoş Geldiniz' })
    ).toBeInTheDocument()

    expect(screen.getByLabelText('E-posta')).toBeInTheDocument()
    expect(screen.getByLabelText('Şifre')).toBeInTheDocument()

    expect(
      screen.getByRole('button', { name: 'Giriş Yap' })
    ).toBeInTheDocument()
  })

  it('switches to the registration form', async () => {
    const { user } = renderAuth()

    await user.click(
      screen.getByRole('button', { name: 'Kayıt Ol' })
    )

    expect(
      screen.getByRole('heading', { name: 'Hesap Oluştur' })
    ).toBeInTheDocument()
  })

  it('switches back to the login form', async () => {
    const { user } = renderAuth()

    await user.click(
      screen.getByRole('button', { name: 'Kayıt Ol' })
    )

    await user.click(
      screen.getByRole('button', { name: 'Giriş Yap' })
    )

    expect(
      screen.getByRole('heading', { name: 'Hoş Geldiniz' })
    ).toBeInTheDocument()
  })

  it('logs in and redirects to the dashboard', async () => {
    api.post.mockResolvedValueOnce({
      data: { access_token: 'mock-access-token' },
    })

    const { user, onLogin } = renderAuth()

    await fillForm(user)

    await user.click(
      screen.getByRole('button', { name: 'Giriş Yap' })
    )

    expect(
      await screen.findByRole('heading', { name: 'Dashboard' })
    ).toBeInTheDocument()

    expect(onLogin).toHaveBeenCalledTimes(1)

    expect(localStorage.getItem('access_token'))
      .toBe('mock-access-token')

    const [url, formData, config] = api.post.mock.calls[0]

    expect(url).toBe('/login')
    expect(formData.get('username')).toBe('test@example.com')
    expect(formData.get('password')).toBe('TestPassword123')

    expect(config.headers['Content-Type'])
      .toBe('application/x-www-form-urlencoded')
  })

  it('displays invalid credentials error', async () => {
    api.post.mockRejectedValueOnce({
      response: {
        data: {
          detail: 'Invalid email or password',
        },
      },
    })

    const { user, onLogin } = renderAuth()

    await fillForm(user)

    await user.click(
      screen.getByRole('button', { name: 'Giriş Yap' })
    )

    expect(
      await screen.findByText('Invalid email or password')
    ).toBeInTheDocument()

    expect(onLogin).not.toHaveBeenCalled()
    expect(localStorage.getItem('access_token')).toBeNull()
  })

  it('registers a user and automatically logs in', async () => {
    api.post
      .mockResolvedValueOnce({
        data: {
          id: 1,
          email: 'test@example.com',
          is_active: true,
        },
      })
      .mockResolvedValueOnce({
        data: { access_token: 'mock-register-token' },
      })

    const { user, onLogin } = renderAuth()

    await user.click(
      screen.getByRole('button', { name: 'Kayıt Ol' })
    )

    await fillForm(user)

    await user.click(
      screen.getByRole('button', { name: 'Kayıt Ol' })
    )

    expect(
      await screen.findByRole('heading', { name: 'Dashboard' })
    ).toBeInTheDocument()

    expect(api.post).toHaveBeenCalledTimes(2)

    expect(api.post).toHaveBeenNthCalledWith(
      1,
      '/register',
      {
        email: 'test@example.com',
        password: 'TestPassword123',
      }
    )

    expect(api.post.mock.calls[1][0]).toBe('/login')

    expect(localStorage.getItem('access_token'))
      .toBe('mock-register-token')

    expect(onLogin).toHaveBeenCalledTimes(1)
  })

  it('handles duplicate email registration', async () => {
    api.post.mockRejectedValueOnce({
      response: {
        data: {
          detail: 'Email already registered',
        },
      },
    })

    const { user, onLogin } = renderAuth()

    await user.click(
      screen.getByRole('button', { name: 'Kayıt Ol' })
    )

    await fillForm(user)

    await user.click(
      screen.getByRole('button', { name: 'Kayıt Ol' })
    )

    expect(
      await screen.findByText('Email already registered')
    ).toBeInTheDocument()

    expect(api.post).toHaveBeenCalledTimes(1)
    expect(onLogin).not.toHaveBeenCalled()
    expect(localStorage.getItem('access_token')).toBeNull()
  })

  it('handles network errors', async () => {
    api.post.mockRejectedValueOnce(
      new Error('Network Error')
    )

    const { user, onLogin } = renderAuth()

    await fillForm(user)

    await user.click(
      screen.getByRole('button', { name: 'Giriş Yap' })
    )

    expect(
      await screen.findByText(
        'Bir hata oluştu. Tekrar deneyin.'
      )
    ).toBeInTheDocument()

    expect(onLogin).not.toHaveBeenCalled()
  })

  it('disables the submit button during an API request', async () => {
    let resolveRequest

    api.post.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveRequest = resolve
      })
    )

    const { user } = renderAuth()

    await fillForm(user)

    await user.click(
      screen.getByRole('button', { name: 'Giriş Yap' })
    )

    expect(
      screen.getByRole('button', { name: 'İşleniyor...' })
    ).toBeDisabled()

    resolveRequest({
      data: { access_token: 'mock-loading-token' },
    })

    expect(
      await screen.findByRole('heading', { name: 'Dashboard' })
    ).toBeInTheDocument()
  })

  it('does not submit an empty form', async () => {
    const { user, onLogin } = renderAuth()

    await user.click(
      screen.getByRole('button', { name: 'Giriş Yap' })
    )

    await waitFor(() => {
      expect(api.post).not.toHaveBeenCalled()
    })

    expect(onLogin).not.toHaveBeenCalled()
    expect(localStorage.getItem('access_token')).toBeNull()
  })
  it('handles backend validation errors safely', async () => {
    api.post.mockRejectedValueOnce({
      response: {
        status: 422,
        data: {
          detail: [
            {
              type: 'string_too_short',
              loc: ['body', 'password'],
              msg: 'Invalid input',
            },
          ],
        },
      },
    })

    const { user, onLogin } = renderAuth()

    await fillForm(user)

    await user.click(
      screen.getByRole('button', { name: 'Giriş Yap' })
    )

    expect(
      await screen.findByText(
        'Girdiğiniz bilgileri kontrol edin.'
      )
    ).toBeInTheDocument()

    expect(onLogin).not.toHaveBeenCalled()
    expect(localStorage.getItem('access_token')).toBeNull()
  })
})
