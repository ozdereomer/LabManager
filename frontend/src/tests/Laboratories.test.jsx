import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Laboratories from '../pages/Laboratories'
import api from '../services/api'

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

const mockLaboratories = [
  {
    id: 1,
    name: 'Bilgisayar Laboratuvarı',
    location: 'A Blok',
  },
  {
    id: 2,
    name: 'Elektronik Laboratuvarı',
    location: null,
  },
]

function renderLaboratories(data = mockLaboratories) {
  api.get.mockResolvedValueOnce({ data })

  const user = userEvent.setup()
  const view = render(<Laboratories />)

  return { user, ...view }
}

async function openCreateForm(user) {
  await user.click(
    screen.getByRole('button', {
      name: '+ Laboratuvar Ekle',
    })
  )
}

async function fillForm(user, name, location = '') {
  await user.type(
    screen.getByLabelText('Laboratuvar Adı'),
    name
  )

  if (location) {
    await user.type(
      screen.getByLabelText('Konum'),
      location
    )
  }
}

function getLabRow(name) {
  return within(
    screen.getByRole('row', {
      name: new RegExp(name),
    })
  )
}

describe('Laboratories component', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
    api.put.mockReset()
    api.delete.mockReset()
  })

  it('displays loading state', () => {
    api.get.mockImplementationOnce(
      () => new Promise(() => {})
    )

    render(<Laboratories />)

    expect(
      screen.getByText('Laboratuvarlar yükleniyor...')
    ).toBeInTheDocument()

    expect(api.get).toHaveBeenCalledWith('/laboratories')
  })

  it('displays laboratories returned by the API', async () => {
    renderLaboratories()

    expect(
      await screen.findByText('Bilgisayar Laboratuvarı')
    ).toBeInTheDocument()

    expect(
      screen.getByText('Elektronik Laboratuvarı')
    ).toBeInTheDocument()

    expect(
      getLabRow('Bilgisayar Laboratuvarı')
        .getByText('A Blok')
    ).toBeInTheDocument()

    expect(
      getLabRow('Elektronik Laboratuvarı')
        .getByText('Belirtilmemiş')
    ).toBeInTheDocument()
  })

  it('displays an empty state', async () => {
    renderLaboratories([])

    expect(
      await screen.findByText(
        'Henüz kayıtlı laboratuvarınız bulunmuyor.'
      )
    ).toBeInTheDocument()
  })

  it('handles laboratory loading errors', async () => {
    api.get.mockRejectedValueOnce(
      new Error('Network Error')
    )

    render(<Laboratories />)

    expect(
      await screen.findByText(
        'Laboratuvarlar yüklenirken bir hata oluştu.'
      )
    ).toBeInTheDocument()
  })

  it('opens the create laboratory form', async () => {
    const { user } = renderLaboratories([])

    await openCreateForm(user)

    expect(
      screen.getByRole('heading', {
        name: 'Yeni Laboratuvar',
      })
    ).toBeInTheDocument()

    expect(
      screen.getByLabelText('Laboratuvar Adı')
    ).toBeInTheDocument()

    expect(
      screen.getByLabelText('Konum')
    ).toBeInTheDocument()
  })

  it('closes and resets the form when cancelled', async () => {
    const { user } = renderLaboratories([])

    await openCreateForm(user)
    await fillForm(user, 'Geçici Laboratuvar', 'B Blok')

    await user.click(
      screen.getByRole('button', { name: 'İptal' })
    )

    expect(
      screen.queryByLabelText('Laboratuvar Adı')
    ).not.toBeInTheDocument()

    await openCreateForm(user)

    expect(
      screen.getByLabelText('Laboratuvar Adı')
    ).toHaveValue('')

    expect(
      screen.getByLabelText('Konum')
    ).toHaveValue('')
  })

  it('creates a laboratory and updates the list', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        id: 3,
        name: 'Yazılım Laboratuvarı',
        location: 'C Blok',
      },
    })

    const { user } = renderLaboratories()

    await screen.findByText('Bilgisayar Laboratuvarı')

    await openCreateForm(user)

    await fillForm(
      user,
      'Yazılım Laboratuvarı',
      'C Blok'
    )

    await user.click(
      screen.getByRole('button', { name: 'Kaydet' })
    )

    expect(api.post).toHaveBeenCalledWith(
      '/laboratories',
      {
        name: 'Yazılım Laboratuvarı',
        location: 'C Blok',
      }
    )

    expect(
      await screen.findByText('Yazılım Laboratuvarı')
    ).toBeInTheDocument()

    expect(
      screen.getByText('Bilgisayar Laboratuvarı')
    ).toBeInTheDocument()

    expect(
      screen.queryByLabelText('Laboratuvar Adı')
    ).not.toBeInTheDocument()
  })

  it('trims the name and sends null for empty location', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        id: 3,
        name: 'Test Laboratuvarı',
        location: null,
      },
    })

    const { user } = renderLaboratories([])

    await openCreateForm(user)

    await fillForm(user, '  Test Laboratuvarı  ')

    await user.click(
      screen.getByRole('button', { name: 'Kaydet' })
    )

    expect(api.post).toHaveBeenCalledWith(
      '/laboratories',
      {
        name: 'Test Laboratuvarı',
        location: null,
      }
    )

    expect(
      await screen.findByText('Test Laboratuvarı')
    ).toBeInTheDocument()

    expect(
      screen.getByText('Belirtilmemiş')
    ).toBeInTheDocument()
  })

  it('rejects a whitespace-only laboratory name', async () => {
    const { user } = renderLaboratories([])

    await openCreateForm(user)
    await fillForm(user, '   ')

    await user.click(
      screen.getByRole('button', { name: 'Kaydet' })
    )

    expect(
      screen.getByText('Laboratuvar adı zorunludur.')
    ).toBeInTheDocument()

    expect(api.post).not.toHaveBeenCalled()
  })

  it('opens the edit form with existing values', async () => {
    const { user } = renderLaboratories()

    await screen.findByText('Bilgisayar Laboratuvarı')

    await user.click(
      getLabRow('Bilgisayar Laboratuvarı')
        .getByRole('button', { name: 'Düzenle' })
    )

    expect(
      screen.getByRole('heading', {
        name: 'Laboratuvarı Düzenle',
      })
    ).toBeInTheDocument()

    expect(
      screen.getByLabelText('Laboratuvar Adı')
    ).toHaveValue('Bilgisayar Laboratuvarı')

    expect(
      screen.getByLabelText('Konum')
    ).toHaveValue('A Blok')
  })

  it('updates an existing laboratory', async () => {
    api.put.mockResolvedValueOnce({
      data: {
        id: 1,
        name: 'Güncellenmiş Laboratuvar',
        location: 'D Blok',
      },
    })

    const { user } = renderLaboratories()

    await screen.findByText('Bilgisayar Laboratuvarı')

    await user.click(
      getLabRow('Bilgisayar Laboratuvarı')
        .getByRole('button', { name: 'Düzenle' })
    )

    await user.clear(
      screen.getByLabelText('Laboratuvar Adı')
    )

    await user.clear(
      screen.getByLabelText('Konum')
    )

    await fillForm(
      user,
      'Güncellenmiş Laboratuvar',
      'D Blok'
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Değişiklikleri Kaydet',
      })
    )

    expect(api.put).toHaveBeenCalledWith(
      '/laboratories/1',
      {
        name: 'Güncellenmiş Laboratuvar',
        location: 'D Blok',
      }
    )

    expect(
      await screen.findByText('Güncellenmiş Laboratuvar')
    ).toBeInTheDocument()

    expect(
      screen.queryByText('Bilgisayar Laboratuvarı')
    ).not.toBeInTheDocument()

    expect(
      screen.getByText('Elektronik Laboratuvarı')
    ).toBeInTheDocument()
  })

  it('deletes a laboratory after confirmation', async () => {
    const confirmMock = vi
      .spyOn(window, 'confirm')
      .mockReturnValue(true)

    api.delete.mockResolvedValueOnce({ data: {} })

    const { user } = renderLaboratories()

    await screen.findByText('Bilgisayar Laboratuvarı')

    await user.click(
      getLabRow('Bilgisayar Laboratuvarı')
        .getByRole('button', { name: 'Sil' })
    )

    expect(confirmMock).toHaveBeenCalledTimes(1)

    expect(api.delete).toHaveBeenCalledWith(
      '/laboratories/1'
    )

    expect(
      screen.queryByText('Bilgisayar Laboratuvarı')
    ).not.toBeInTheDocument()

    expect(
      screen.getByText('Elektronik Laboratuvarı')
    ).toBeInTheDocument()
  })

  it('does not delete a laboratory when cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    const { user } = renderLaboratories()

    await screen.findByText('Bilgisayar Laboratuvarı')

    await user.click(
      getLabRow('Bilgisayar Laboratuvarı')
        .getByRole('button', { name: 'Sil' })
    )

    expect(api.delete).not.toHaveBeenCalled()

    expect(
      screen.getByText('Bilgisayar Laboratuvarı')
    ).toBeInTheDocument()
  })

  it('handles laboratory deletion conflicts', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    api.delete.mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          detail: 'Cannot delete laboratory with equipment',
        },
      },
    })

    const { user } = renderLaboratories()

    await screen.findByText('Bilgisayar Laboratuvarı')

    await user.click(
      getLabRow('Bilgisayar Laboratuvarı')
        .getByRole('button', { name: 'Sil' })
    )

    expect(
      await screen.findByText(
        'Cannot delete laboratory with equipment'
      )
    ).toBeInTheDocument()

    expect(
      screen.getByText('Bilgisayar Laboratuvarı')
    ).toBeInTheDocument()
  })

  it('handles errors while creating a laboratory', async () => {
    api.post.mockRejectedValueOnce(
      new Error('Network Error')
    )

    const { user } = renderLaboratories([])

    await openCreateForm(user)
    await fillForm(user, 'Test Laboratuvarı')

    await user.click(
      screen.getByRole('button', { name: 'Kaydet' })
    )

    expect(
      await screen.findByText(
        'İşlem sırasında bir hata oluştu.'
      )
    ).toBeInTheDocument()

    expect(
      screen.getByLabelText('Laboratuvar Adı')
    ).toHaveValue('Test Laboratuvarı')

    expect(
      screen.getByRole('button', { name: 'Kaydet' })
    ).toBeEnabled()
  })

  it('disables the save button during an API request', async () => {
    let resolveRequest

    api.post.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveRequest = resolve
      })
    )

    const { user } = renderLaboratories([])

    await openCreateForm(user)
    await fillForm(user, 'Test Laboratuvarı')

    await user.click(
      screen.getByRole('button', { name: 'Kaydet' })
    )

    expect(
      screen.getByRole('button', {
        name: 'Kaydediliyor...',
      })
    ).toBeDisabled()

    resolveRequest({
      data: {
        id: 3,
        name: 'Test Laboratuvarı',
        location: null,
      },
    })

    expect(
      await screen.findByText('Test Laboratuvarı')
    ).toBeInTheDocument()
  })
})
describe('Laboratories validation errors', () => {
  it('handles validation error arrays without crashing', async () => {
    api.get.mockReset()
    api.post.mockReset()

    api.post.mockRejectedValueOnce({
      response: {
        status: 422,
        data: {
          detail: [
            {
              type: 'string_too_long',
              loc: ['body', 'name'],
              msg: 'Invalid input',
            },
          ],
        },
      },
    })

    const { user } = renderLaboratories([])

    await openCreateForm(user)
    await fillForm(user, 'Test Laboratuvarı')

    await user.click(
      screen.getByRole('button', { name: 'Kaydet' })
    )

    expect(
      await screen.findByText(
        'Girdiğiniz bilgileri kontrol edin.'
      )
    ).toBeInTheDocument()

    expect(
      screen.getByLabelText('Laboratuvar Adı')
    ).toHaveValue('Test Laboratuvarı')

    expect(
      screen.getByRole('button', { name: 'Kaydet' })
    ).toBeEnabled()
  })
})
