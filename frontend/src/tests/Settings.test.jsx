import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'

import {
  render,
  screen,
  within,
  waitFor,
  fireEvent,
  act,
} from '@testing-library/react'

import userEvent from '@testing-library/user-event'

import Settings from '../pages/Settings'
import api from '../services/api'

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}))

const mockProfile = {
  id: 1,
  email: 'test@example.com',
  is_active: true,
  created_at: '2026-11-01T12:00:00Z',
}

function renderSettings(profile = mockProfile) {
  api.get.mockResolvedValueOnce({
    data: profile,
  })

  const onLogout = vi.fn()
  const user = userEvent.setup()

  const view = render(
    <Settings onLogout={onLogout} />
  )

  return { user, onLogout, ...view }
}

function getEmailForm() {
  return within(
    screen.getByRole('heading', {
      name: 'E-posta Değiştir',
    }).closest('section')
  )
}

function getPasswordForm() {
  return within(
    screen.getByRole('heading', {
      name: 'Şifre Değiştir',
    }).closest('section')
  )
}

async function fillEmailForm(
  user,
  email = 'new@example.com',
  password = 'TestPassword123'
) {
  await screen.findByText('test@example.com')

  const form = getEmailForm()

  await user.type(
    form.getByLabelText('Yeni e-posta adresi'),
    email
  )

  await user.type(
    form.getByLabelText('Mevcut şifre'),
    password
  )
}

async function submitEmailForm(user) {
  await user.click(
    getEmailForm().getByRole('button', {
      name: 'E-postayı Güncelle',
    })
  )
}

async function fillPasswordForm(
  user,
  current = 'TestPassword123',
  password = 'NewPassword456',
  confirmation = password
) {
  await screen.findByText('test@example.com')

  const form = getPasswordForm()

  await user.type(
    form.getByLabelText('Mevcut şifre'),
    current
  )

  await user.type(
    form.getByLabelText('Yeni şifre', {
      exact: true,
    }),
    password
  )

  await user.type(
    form.getByLabelText('Yeni şifre tekrar'),
    confirmation
  )
}

async function submitPasswordForm(user) {
  await user.click(
    getPasswordForm().getByRole('button', {
      name: 'Şifreyi Güncelle',
    })
  )
}

function apiError(status, detail) {
  return {
    response: {
      status,
      data: { detail },
    },
  }
}

describe('Settings component', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.put.mockReset()

    vi.spyOn(window, 'alert')
      .mockImplementation(() => {})
  })

  // PROFILE TESTS

  it('displays loading state', () => {
    api.get.mockImplementation(
      () => new Promise(() => {})
    )

    render(
      <Settings onLogout={vi.fn()} />
    )

    expect(
      screen.getByText(
        'Hesap bilgileri yükleniyor...'
      )
    ).toBeInTheDocument()

    expect(api.get).toHaveBeenCalledWith(
      '/users/me'
    )
  })

  it('displays user profile information', async () => {
    renderSettings()

    expect(
      await screen.findByText('test@example.com')
    ).toBeInTheDocument()

    expect(
      screen.getByText('#1')
    ).toBeInTheDocument()

    expect(
      screen.getByText('Aktif')
    ).toBeInTheDocument()
  })

  it('displays the registration date', async () => {
    renderSettings()

    const expectedDate = new Date(
      mockProfile.created_at
    ).toLocaleDateString('tr-TR')

    expect(
      await screen.findByText(expectedDate)
    ).toBeInTheDocument()
  })

  it('displays inactive account status', async () => {
    renderSettings({
      ...mockProfile,
      is_active: false,
    })

    expect(
      await screen.findByText('Pasif')
    ).toBeInTheDocument()
  })

  it('handles profile loading errors', async () => {
    api.get.mockRejectedValueOnce(
      new Error('Network Error')
    )

    const onLogout = vi.fn()

    render(
      <Settings onLogout={onLogout} />
    )

    expect(
      await screen.findByText(
        'Hesap bilgileri yüklenemedi.'
      )
    ).toBeInTheDocument()

    expect(onLogout).not.toHaveBeenCalled()
  })

  it('delegates profile request 401 to the interceptor', async () => {
    api.get.mockRejectedValueOnce(
      apiError(401, 'Invalid or expired token')
    )

    const onLogout = vi.fn()

    render(
      <Settings onLogout={onLogout} />
    )

    await waitFor(() => {
      expect(
        screen.queryByText('Hesap bilgileri yükleniyor...')
      ).not.toBeInTheDocument()

      expect(
        screen.queryAllByRole('button', {
          name: 'İşleniyor...',
        })
      ).toHaveLength(0)
    })

    expect(onLogout).not.toHaveBeenCalled()
  })

  // EMAIL UPDATE TESTS

  it('updates email and logs out successfully', async () => {
    api.put.mockResolvedValueOnce({
      data: {
        message: 'Email updated successfully',
      },
    })

    const { user, onLogout } = renderSettings()

    await fillEmailForm(user)
    await submitEmailForm(user)

    expect(api.put).toHaveBeenCalledWith(
      '/users/me/email',
      {
        new_email: 'new@example.com',
        current_password: 'TestPassword123',
      }
    )

    expect(window.alert).toHaveBeenCalledWith(
      'E-posta adresiniz güncellendi. Lütfen tekrar giriş yapın.'
    )

    expect(onLogout).toHaveBeenCalledTimes(1)

    expect(
      getEmailForm().getByLabelText('Mevcut şifre')
    ).toHaveValue('')
  })

  it('prevents email update with an invalid email', async () => {
    const { user, onLogout } = renderSettings()

    await fillEmailForm(
      user,
      'invalid-email'
    )

    await submitEmailForm(user)

    expect(
      getEmailForm().getByLabelText(
        'Yeni e-posta adresi'
      )
    ).toBeInvalid()

    expect(api.put).not.toHaveBeenCalled()
    expect(onLogout).not.toHaveBeenCalled()
  })

  it.each([
    [
      400,
      'Incorrect current password',
      'Mevcut şifreniz yanlış.',
    ],
    [
      409,
      'Email already registered',
      'Bu e-posta adresi zaten kayıtlı.',
    ],
    [
      400,
      'New email must be different',
      'Yeni e-posta adresiniz farklı olmalıdır.',
    ],
    [
      422,
      [{ msg: 'Invalid input' }],
      'Lütfen girdiğiniz bilgileri kontrol edin.',
    ],
  ])(
    'handles email update error %s: %j',
    async (status, detail, expectedMessage) => {
      api.put.mockRejectedValueOnce(
        apiError(status, detail)
      )

      const { user, onLogout } = renderSettings()

      await fillEmailForm(user)
      await submitEmailForm(user)

      expect(
        await screen.findByText(expectedMessage)
      ).toBeInTheDocument()

      expect(onLogout).not.toHaveBeenCalled()
      expect(window.alert).not.toHaveBeenCalled()

      expect(
        getEmailForm().getByRole('button', {
          name: 'E-postayı Güncelle',
        })
      ).toBeEnabled()
    }
  )

  it('delegates email update 401 to the interceptor', async () => {
    api.put.mockRejectedValueOnce(
      apiError(401, 'Invalid or expired token')
    )

    const { user, onLogout } = renderSettings()

    await fillEmailForm(user)
    await submitEmailForm(user)

    await waitFor(() => {
      expect(
        screen.queryByText('Hesap bilgileri yükleniyor...')
      ).not.toBeInTheDocument()

      expect(
        screen.queryAllByRole('button', {
          name: 'İşleniyor...',
        })
      ).toHaveLength(0)
    })

    expect(onLogout).not.toHaveBeenCalled()

    expect(window.alert).not.toHaveBeenCalled()
  })

  // PASSWORD UPDATE TESTS

  it('updates password and logs out successfully', async () => {
    api.put.mockResolvedValueOnce({
      data: {
        message: 'Password updated successfully',
      },
    })

    const { user, onLogout } = renderSettings()

    await fillPasswordForm(user)
    await submitPasswordForm(user)

    expect(api.put).toHaveBeenCalledWith(
      '/users/me/password',
      {
        current_password: 'TestPassword123',
        new_password: 'NewPassword456',
      }
    )

    expect(window.alert).toHaveBeenCalledWith(
      'Şifreniz güncellendi. Lütfen tekrar giriş yapın.'
    )

    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('clears password fields after successful update', async () => {
    api.put.mockResolvedValueOnce({
      data: {},
    })

    const { user } = renderSettings()

    await fillPasswordForm(user)
    await submitPasswordForm(user)

    await waitFor(() => {
      expect(
        getPasswordForm().getByLabelText(
          'Mevcut şifre'
        )
      ).toHaveValue('')

      expect(
        getPasswordForm().getByLabelText(
          'Yeni şifre',
          { exact: true }
        )
      ).toHaveValue('')

      expect(
        getPasswordForm().getByLabelText(
          'Yeni şifre tekrar'
        )
      ).toHaveValue('')
    })
  })

  it('rejects passwords shorter than eight characters', async () => {
    const { user, onLogout } = renderSettings()

    await fillPasswordForm(
      user,
      'TestPassword123',
      'short'
    )

    const form = getPasswordForm()
      .getByRole('button', {
        name: 'Şifreyi Güncelle',
      }).closest('form')

    fireEvent.submit(form)

    expect(
      screen.getByText(
        'Yeni şifre en az 8 karakter olmalıdır.'
      )
    ).toBeInTheDocument()

    expect(api.put).not.toHaveBeenCalled()
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('rejects mismatched new passwords', async () => {
    const { user, onLogout } = renderSettings()

    await fillPasswordForm(
      user,
      'TestPassword123',
      'NewPassword456',
      'DifferentPassword789'
    )

    await submitPasswordForm(user)

    expect(
      screen.getByText(
        'Yeni şifreler eşleşmiyor.'
      )
    ).toBeInTheDocument()

    expect(api.put).not.toHaveBeenCalled()
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('rejects reuse of the current password', async () => {
    const { user, onLogout } = renderSettings()

    await fillPasswordForm(
      user,
      'TestPassword123',
      'TestPassword123'
    )

    await submitPasswordForm(user)

    expect(
      screen.getByText(
        'Yeni şifreniz mevcut şifrenizden farklı olmalıdır.'
      )
    ).toBeInTheDocument()

    expect(api.put).not.toHaveBeenCalled()
    expect(onLogout).not.toHaveBeenCalled()
  })

  it.each([
    [
      400,
      'Incorrect current password',
      'Mevcut şifreniz yanlış.',
    ],
    [
      400,
      'New password must be different',
      'Yeni şifreniz mevcut şifrenizden farklı olmalıdır.',
    ],
    [
      422,
      [{ msg: 'Invalid input' }],
      'Lütfen girdiğiniz bilgileri kontrol edin.',
    ],
  ])(
    'handles password update error %s: %j',
    async (status, detail, expectedMessage) => {
      api.put.mockRejectedValueOnce(
        apiError(status, detail)
      )

      const { user, onLogout } = renderSettings()

      await fillPasswordForm(user)
      await submitPasswordForm(user)

      expect(
        await screen.findByText(expectedMessage)
      ).toBeInTheDocument()

      expect(onLogout).not.toHaveBeenCalled()
      expect(window.alert).not.toHaveBeenCalled()

      expect(
        getPasswordForm().getByRole('button', {
          name: 'Şifreyi Güncelle',
        })
      ).toBeEnabled()
    }
  )

  it('handles unexpected password error details safely', async () => {
    api.put.mockRejectedValueOnce(
      apiError(500, 'constructor')
    )

    const { user, onLogout } = renderSettings()

    await fillPasswordForm(user)
    await submitPasswordForm(user)

    expect(
      await screen.findByText(
        'İşlem gerçekleştirilemedi.'
      )
    ).toBeInTheDocument()

    expect(onLogout).not.toHaveBeenCalled()
    expect(window.alert).not.toHaveBeenCalled()
  })

  it('delegates password update 401 to the interceptor', async () => {
    api.put.mockRejectedValueOnce(
      apiError(401, 'Invalid or expired token')
    )

    const { user, onLogout } = renderSettings()

    await fillPasswordForm(user)
    await submitPasswordForm(user)

    await waitFor(() => {
      expect(
        screen.queryByText('Hesap bilgileri yükleniyor...')
      ).not.toBeInTheDocument()

      expect(
        screen.queryAllByRole('button', {
          name: 'İşleniyor...',
        })
      ).toHaveLength(0)
    })

    expect(onLogout).not.toHaveBeenCalled()

    expect(window.alert).not.toHaveBeenCalled()
  })

  // SESSION MANAGEMENT TESTS

  it('logs out when the logout button is clicked', async () => {
    const { user, onLogout } = renderSettings()

    await screen.findByText('test@example.com')

    await user.click(
      screen.getByRole('button', {
        name: 'Çıkış Yap',
      })
    )

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(api.put).not.toHaveBeenCalled()
  })

  it('disables account actions during an update request', async () => {
    let resolveRequest

    api.put.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveRequest = resolve
      })
    )

    const { user, onLogout } = renderSettings()

    await fillEmailForm(user)
    await submitEmailForm(user)

    expect(
      getEmailForm().getByRole('button', {
        name: 'İşleniyor...',
      })
    ).toBeDisabled()

    expect(
      getPasswordForm().getByRole('button', {
        name: 'İşleniyor...',
      })
    ).toBeDisabled()

    expect(
      screen.getByRole('button', {
        name: 'Çıkış Yap',
      })
    ).toBeDisabled()

    expect(onLogout).not.toHaveBeenCalled()

    await act(async () => {
      resolveRequest({ data: {} })
    })

    expect(onLogout).toHaveBeenCalledTimes(1)

    expect(
      getEmailForm().getByRole('button', {
        name: 'E-postayı Güncelle',
      })
    ).toBeEnabled()
  })
})

describe('Settings rate limiting and service availability', () => {
  const scenarios = [
    [
      429,
      { 'retry-after': '45' },
      'Çok fazla işlem yaptınız. Lütfen 45 saniye sonra tekrar deneyin.',
    ],
    [
      429,
      {},
      'Çok fazla istek gönderdiniz. Lütfen bir süre sonra tekrar deneyin.',
    ],
    [
      503,
      {},
      'Hizmet geçici olarak kullanılamıyor. Lütfen daha sonra tekrar deneyin.',
    ],
  ]

  beforeEach(() => {
    api.get.mockReset()
    api.put.mockReset()
    vi.spyOn(window, 'alert').mockImplementation(() => {})
  })

  it.each(scenarios)(
    'handles profile loading error %s with headers %j',
    async (status, headers, message) => {
      api.get.mockRejectedValueOnce({
        response: { status, headers },
      })

      const onLogout = vi.fn()

      render(<Settings onLogout={onLogout} />)

      expect(
        await screen.findByText(message)
      ).toBeInTheDocument()

      expect(onLogout).not.toHaveBeenCalled()
    }
  )

  it.each(scenarios)(
    'handles email update error %s with headers %j',
    async (status, headers, message) => {
      api.put.mockRejectedValueOnce({
        response: { status, headers },
      })

      const { user, onLogout } = renderSettings()

      await fillEmailForm(user)
      await submitEmailForm(user)

      expect(
        await screen.findByText(message)
      ).toBeInTheDocument()

      expect(onLogout).not.toHaveBeenCalled()
      expect(window.alert).not.toHaveBeenCalled()

      expect(
        getEmailForm().getByRole('button', {
          name: 'E-postayı Güncelle',
        })
      ).toBeEnabled()
    }
  )

  it.each(scenarios)(
    'handles password update error %s with headers %j',
    async (status, headers, message) => {
      api.put.mockRejectedValueOnce({
        response: { status, headers },
      })

      const { user, onLogout } = renderSettings()

      await fillPasswordForm(user)
      await submitPasswordForm(user)

      expect(
        await screen.findByText(message)
      ).toBeInTheDocument()

      expect(onLogout).not.toHaveBeenCalled()
      expect(window.alert).not.toHaveBeenCalled()

      expect(
        getPasswordForm().getByRole('button', {
          name: 'Şifreyi Güncelle',
        })
      ).toBeEnabled()
    }
  )
})
