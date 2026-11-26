import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Maintenance from '../pages/Maintenance'
import api from '../services/api'

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

const mockEquipment = [
  {
    id: 1,
    name: '3D Yazıcı',
    serial_number: 'PRN-001',
  },
  {
    id: 2,
    name: 'Osiloskop',
    serial_number: 'OSC-001',
  },
]

const mockRecords = [
  {
    id: 1,
    equipment_id: 1,
    maintenance_date: '2026-11-26',
    description: 'Periyodik bakım',
    technician: 'Test Teknisyen',
    cost: '250.50',
  },
  {
    id: 2,
    equipment_id: 2,
    maintenance_date: '2026-11-25',
    description: 'Kalibrasyon',
    technician: null,
    cost: null,
  },
]

const newRecord = {
  id: 3,
  equipment_id: 1,
  maintenance_date: '2026-11-26',
  description: 'Yeni bakım işlemi',
  technician: 'Test Teknisyen',
  cost: 300.50,
}

function renderMaintenance(
  records = mockRecords,
  equipment = mockEquipment
) {
  api.get.mockImplementation((url) => {
    if (url === '/maintenance') {
      return Promise.resolve({ data: records })
    }

    if (url === '/equipment') {
      return Promise.resolve({ data: equipment })
    }

    return Promise.reject(
      new Error('Unexpected endpoint')
    )
  })

  const user = userEvent.setup()
  const view = render(<Maintenance />)

  return { user, ...view }
}

async function openCreateForm(user) {
  const button = screen.getByRole('button', {
    name: '+ Bakım Kaydı Ekle',
  })

  await waitFor(() => {
    expect(button).toBeEnabled()
  })

  await user.click(button)
}

async function fillForm(user, values = {}) {
  const {
    equipmentId = '1',
    date = '2026-11-26',
    description = 'Yeni bakım işlemi',
    technician = 'Test Teknisyen',
    cost = '300.50',
  } = values

  await user.selectOptions(
    screen.getByLabelText('Ekipman'),
    equipmentId
  )

  if (date) {
    await user.type(
      screen.getByLabelText('Bakım Tarihi'),
      date
    )
  }

  if (description) {
    await user.type(
      screen.getByLabelText('Açıklama'),
      description
    )
  }

  if (technician) {
    await user.type(
      screen.getByLabelText('Teknisyen'),
      technician
    )
  }

  if (cost !== '') {
    await user.type(
      screen.getByLabelText('Maliyet'),
      cost
    )
  }
}

async function submitForm(user) {
  await user.click(
    screen.getByRole('button', {
      name: 'Kaydet',
    })
  )
}

function getRecordRow(description) {
  return within(
    screen.getByRole('row', {
      name: new RegExp(description),
    })
  )
}

describe('Maintenance component', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
    api.put.mockReset()
    api.delete.mockReset()
  })

  it('displays loading state', () => {
    api.get.mockImplementation(
      () => new Promise(() => {})
    )

    render(<Maintenance />)

    expect(
      screen.getByText('Bakım kayıtları yükleniyor...')
    ).toBeInTheDocument()

    expect(api.get).toHaveBeenCalledWith('/maintenance')
    expect(api.get).toHaveBeenCalledWith('/equipment')
  })

  it('displays maintenance records and equipment names', async () => {
    renderMaintenance()

    expect(
      await screen.findByText('Periyodik bakım')
    ).toBeInTheDocument()

    expect(
      getRecordRow('Periyodik bakım')
        .getByText('3D Yazıcı')
    ).toBeInTheDocument()

    expect(
      getRecordRow('Kalibrasyon')
        .getByText('Osiloskop')
    ).toBeInTheDocument()

    expect(
      getRecordRow('Periyodik bakım')
        .getByText('2026-11-26')
    ).toBeInTheDocument()
  })

  it('displays technician and cost values correctly', async () => {
    renderMaintenance()

    await screen.findByText('Periyodik bakım')

    expect(
      getRecordRow('Periyodik bakım')
        .getByText('Test Teknisyen')
    ).toBeInTheDocument()

    expect(
      getRecordRow('Periyodik bakım')
        .getByText('250.50 TL')
    ).toBeInTheDocument()

    expect(
      getRecordRow('Kalibrasyon')
        .getAllByText('-', { exact: true })
    ).toHaveLength(2)
  })

  it('displays an empty maintenance state', async () => {
    renderMaintenance([])

    expect(
      await screen.findByText(
        'Henüz kayıtlı bakım işleminiz bulunmuyor.'
      )
    ).toBeInTheDocument()
  })

  it('disables maintenance creation without equipment', async () => {
    renderMaintenance([], [])

    expect(
      await screen.findByText(
        'Önce bir ekipman oluşturmalısınız.'
      )
    ).toBeInTheDocument()

    expect(
      screen.getByRole('button', {
        name: '+ Bakım Kaydı Ekle',
      })
    ).toBeDisabled()
  })

  it('opens the create form with equipment options', async () => {
    const { user } = renderMaintenance()

    await openCreateForm(user)

    expect(
      screen.getByRole('heading', {
        name: 'Yeni Bakım Kaydı',
      })
    ).toBeInTheDocument()

    const select = screen.getByLabelText('Ekipman')

    expect(
      within(select).getByRole('option', {
        name: '3D Yazıcı - PRN-001',
      })
    ).toHaveValue('1')

    expect(
      within(select).getByRole('option', {
        name: 'Osiloskop - OSC-001',
      })
    ).toHaveValue('2')
  })

  it('resets the form when cancelled', async () => {
    const { user } = renderMaintenance()

    await openCreateForm(user)
    await fillForm(user)

    await user.click(
      screen.getByRole('button', {
        name: 'İptal',
      })
    )

    expect(
      screen.queryByLabelText('Açıklama')
    ).not.toBeInTheDocument()

    await openCreateForm(user)

    expect(
      screen.getByLabelText('Ekipman')
    ).toHaveValue('')

    expect(
      screen.getByLabelText('Bakım Tarihi')
    ).toHaveValue('')

    expect(
      screen.getByLabelText('Açıklama')
    ).toHaveValue('')

    expect(
      screen.getByLabelText('Teknisyen')
    ).toHaveValue('')

    expect(
      screen.getByLabelText('Maliyet')
    ).toHaveValue(null)
  })

  it('creates a maintenance record and updates the table', async () => {
    api.post.mockResolvedValueOnce({
      data: newRecord,
    })

    const { user } = renderMaintenance()

    await openCreateForm(user)
    await fillForm(user)
    await submitForm(user)

    expect(api.post).toHaveBeenCalledWith(
      '/maintenance',
      {
        equipment_id: 1,
        maintenance_date: '2026-11-26',
        description: 'Yeni bakım işlemi',
        technician: 'Test Teknisyen',
        cost: 300.50,
      }
    )

    expect(
      await screen.findByText('Yeni bakım işlemi')
    ).toBeInTheDocument()

    expect(
      screen.getByText('Periyodik bakım')
    ).toBeInTheDocument()

    expect(
      screen.queryByLabelText('Açıklama')
    ).not.toBeInTheDocument()
  })

  it('sends null for optional technician and cost', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        ...newRecord,
        technician: null,
        cost: null,
      },
    })

    const { user } = renderMaintenance([])

    await openCreateForm(user)

    await fillForm(user, {
      description: '  Yeni bakım işlemi  ',
      technician: '',
      cost: '',
    })

    await submitForm(user)

    expect(api.post).toHaveBeenCalledWith(
      '/maintenance',
      {
        equipment_id: 1,
        maintenance_date: '2026-11-26',
        description: 'Yeni bakım işlemi',
        technician: null,
        cost: null,
      }
    )

    expect(
      await screen.findByText('Yeni bakım işlemi')
    ).toBeInTheDocument()
  })

  it('rejects whitespace-only descriptions', async () => {
    const { user } = renderMaintenance()

    await openCreateForm(user)

    await fillForm(user, {
      description: '   ',
    })

    await submitForm(user)

    expect(
      screen.getByText(
        'Lütfen zorunlu alanları doldurun.'
      )
    ).toBeInTheDocument()

    expect(api.post).not.toHaveBeenCalled()
  })

  it('prevents submission without a maintenance date', async () => {
    const { user } = renderMaintenance()

    await openCreateForm(user)

    await fillForm(user, {
      date: '',
    })

    await submitForm(user)

    expect(api.post).not.toHaveBeenCalled()

    expect(
      screen.getByLabelText('Bakım Tarihi')
    ).toBeInvalid()
  })

  it('prevents submission with a negative cost', async () => {
    const { user } = renderMaintenance()

    await openCreateForm(user)

    await fillForm(user, {
      cost: '-50',
    })

    await submitForm(user)

    expect(
      screen.getByLabelText('Maliyet')
    ).toBeInvalid()

    expect(api.post).not.toHaveBeenCalled()
  })

  it('accepts zero maintenance cost', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        ...newRecord,
        cost: 0,
      },
    })

    const { user } = renderMaintenance([])

    await openCreateForm(user)

    await fillForm(user, {
      cost: '0',
    })

    await submitForm(user)

    expect(api.post).toHaveBeenCalledWith(
      '/maintenance',
      expect.objectContaining({
        cost: 0,
      })
    )

    expect(
      await screen.findByText('0.00 TL')
    ).toBeInTheDocument()
  })

  it('opens the edit form with existing values', async () => {
    const { user } = renderMaintenance()

    await screen.findByText('Periyodik bakım')

    await user.click(
      getRecordRow('Periyodik bakım')
        .getByRole('button', {
          name: 'Düzenle',
        })
    )

    expect(
      screen.getByRole('heading', {
        name: 'Bakım Kaydını Düzenle',
      })
    ).toBeInTheDocument()

    expect(
      screen.getByLabelText('Ekipman')
    ).toHaveValue('1')

    expect(
      screen.getByLabelText('Bakım Tarihi')
    ).toHaveValue('2026-11-26')

    expect(
      screen.getByLabelText('Açıklama')
    ).toHaveValue('Periyodik bakım')

    expect(
      screen.getByLabelText('Teknisyen')
    ).toHaveValue('Test Teknisyen')

    expect(
      screen.getByLabelText('Maliyet')
    ).toHaveValue(250.50)
  })

  it('updates an existing maintenance record', async () => {
    api.put.mockResolvedValueOnce({
      data: {
        ...mockRecords[0],
        description: 'Güncellenmiş bakım',
        cost: 400,
      },
    })

    const { user } = renderMaintenance()

    await screen.findByText('Periyodik bakım')

    await user.click(
      getRecordRow('Periyodik bakım')
        .getByRole('button', {
          name: 'Düzenle',
        })
    )

    await user.clear(
      screen.getByLabelText('Açıklama')
    )

    await user.type(
      screen.getByLabelText('Açıklama'),
      'Güncellenmiş bakım'
    )

    await user.clear(
      screen.getByLabelText('Maliyet')
    )

    await user.type(
      screen.getByLabelText('Maliyet'),
      '400'
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Değişiklikleri Kaydet',
      })
    )

    expect(api.put).toHaveBeenCalledWith(
      '/maintenance/1',
      {
        equipment_id: 1,
        maintenance_date: '2026-11-26',
        description: 'Güncellenmiş bakım',
        technician: 'Test Teknisyen',
        cost: 400,
      }
    )

    expect(
      await screen.findByText('Güncellenmiş bakım')
    ).toBeInTheDocument()

    expect(
      screen.getByText('400.00 TL')
    ).toBeInTheDocument()

    expect(
      screen.queryByText('Periyodik bakım')
    ).not.toBeInTheDocument()

    expect(
      screen.getByText('Kalibrasyon')
    ).toBeInTheDocument()
  })

  it('deletes a maintenance record after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    api.delete.mockResolvedValueOnce({
      data: {},
    })

    const { user } = renderMaintenance()

    await screen.findByText('Periyodik bakım')

    await user.click(
      getRecordRow('Periyodik bakım')
        .getByRole('button', {
          name: 'Sil',
        })
    )

    expect(api.delete).toHaveBeenCalledWith(
      '/maintenance/1'
    )

    await waitFor(() => {
      expect(
        screen.queryByText('Periyodik bakım')
      ).not.toBeInTheDocument()
    })

    expect(
      screen.getByText('Kalibrasyon')
    ).toBeInTheDocument()
  })

  it('does not delete a record when cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    const { user } = renderMaintenance()

    await screen.findByText('Periyodik bakım')

    await user.click(
      getRecordRow('Periyodik bakım')
        .getByRole('button', {
          name: 'Sil',
        })
    )

    expect(api.delete).not.toHaveBeenCalled()

    expect(
      screen.getByText('Periyodik bakım')
    ).toBeInTheDocument()
  })

  it('handles API loading errors', async () => {
    api.get.mockRejectedValue(
      new Error('Network Error')
    )

    render(<Maintenance />)

    expect(
      await screen.findByText(
        'Veriler yüklenirken bir hata oluştu.'
      )
    ).toBeInTheDocument()
  })

  it('handles validation error arrays without crashing', async () => {
    api.post.mockRejectedValueOnce({
      response: {
        status: 422,
        data: {
          detail: [
            {
              type: 'string_too_long',
              loc: ['body', 'technician'],
              msg: 'Invalid input',
            },
          ],
        },
      },
    })

    const { user } = renderMaintenance()

    await openCreateForm(user)
    await fillForm(user)
    await submitForm(user)

    expect(
      await screen.findByText(
        'Girdiğiniz bilgileri kontrol edin.'
      )
    ).toBeInTheDocument()

    expect(
      screen.getByLabelText('Açıklama')
    ).toHaveValue('Yeni bakım işlemi')

    expect(
      screen.getByRole('button', {
        name: 'Kaydet',
      })
    ).toBeEnabled()
  })

  it('handles maintenance deletion errors', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    api.delete.mockRejectedValueOnce(
      new Error('Network Error')
    )

    const { user } = renderMaintenance()

    await screen.findByText('Periyodik bakım')

    await user.click(
      getRecordRow('Periyodik bakım')
        .getByRole('button', {
          name: 'Sil',
        })
    )

    expect(
      await screen.findByText(
        'Bakım kaydı silinirken bir hata oluştu.'
      )
    ).toBeInTheDocument()

    expect(
      screen.getByText('Periyodik bakım')
    ).toBeInTheDocument()
  })

  it('disables the save button during an API request', async () => {
    let resolveRequest

    api.post.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveRequest = resolve
      })
    )

    const { user } = renderMaintenance()

    await openCreateForm(user)
    await fillForm(user)
    await submitForm(user)

    expect(
      screen.getByRole('button', {
        name: 'Kaydediliyor...',
      })
    ).toBeDisabled()

    resolveRequest({
      data: newRecord,
    })

    await waitFor(() => {
      expect(
        screen.getByRole('row', {
          name: /Yeni bakım işlemi/,
        })
      ).toBeInTheDocument()
    })

    expect(
      screen.queryByLabelText('Açıklama')
    ).not.toBeInTheDocument()
  })
})
