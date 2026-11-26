import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Equipment from '../pages/Equipment'
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
    location: 'B Blok',
  },
]

const mockEquipment = [
  {
    id: 1,
    name: '3D Yazıcı',
    serial_number: 'PRN-001',
    status: 'available',
    laboratory_id: 1,
  },
  {
    id: 2,
    name: 'Osiloskop',
    serial_number: 'OSC-001',
    status: 'maintenance',
    laboratory_id: 2,
  },
  {
    id: 3,
    name: 'Multimetre',
    serial_number: 'MLT-001',
    status: 'broken',
    laboratory_id: 2,
  },
]

function renderEquipment(
  equipment = mockEquipment,
  laboratories = mockLaboratories
) {
  api.get.mockImplementation((url) => {
    if (url === '/equipment') {
      return Promise.resolve({ data: equipment })
    }

    if (url === '/laboratories') {
      return Promise.resolve({ data: laboratories })
    }

    return Promise.reject(new Error('Unexpected endpoint'))
  })

  const user = userEvent.setup()
  const view = render(<Equipment />)

  return { user, ...view }
}

async function openCreateForm(user) {
  await screen.findByRole('table').catch(() => null)
  await user.click(
    screen.getByRole('button', {
      name: '+ Ekipman Ekle',
    })
  )
}

async function fillForm(
  user,
  name = 'Test Ekipmanı',
  serialNumber = 'TEST-001',
  status = 'available',
  laboratoryId = '1'
) {
  await user.type(
    screen.getByLabelText('Ekipman Adı'),
    name
  )

  await user.type(
    screen.getByLabelText('Seri Numarası'),
    serialNumber
  )

  await user.selectOptions(
    screen.getByLabelText('Durum'),
    status
  )

  await user.selectOptions(
    screen.getByLabelText('Bağlı Laboratuvar'),
    laboratoryId
  )
}

async function submitForm(user) {
  await user.click(
    screen.getByRole('button', { name: 'Kaydet' })
  )
}

function getEquipmentRow(name) {
  return within(
    screen.getByRole('row', {
      name: new RegExp(name),
    })
  )
}

describe('Equipment component', () => {
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

    render(<Equipment />)

    expect(
      screen.getByText('Ekipmanlar yükleniyor...')
    ).toBeInTheDocument()

    expect(api.get).toHaveBeenCalledWith('/equipment')
    expect(api.get).toHaveBeenCalledWith('/laboratories')
  })

  it('displays equipment and serial numbers', async () => {
    renderEquipment()

    expect(
      await screen.findByText('3D Yazıcı')
    ).toBeInTheDocument()

    expect(
      getEquipmentRow('3D Yazıcı').getByText('PRN-001')
    ).toBeInTheDocument()

    expect(
      screen.getByText('Osiloskop')
    ).toBeInTheDocument()

    expect(
      screen.getByText('Multimetre')
    ).toBeInTheDocument()
  })

  it('displays status labels and laboratory names', async () => {
    renderEquipment()

    await screen.findByText('3D Yazıcı')

    expect(
      getEquipmentRow('3D Yazıcı')
        .getByText('Kullanılabilir')
    ).toBeInTheDocument()

    expect(
      getEquipmentRow('3D Yazıcı')
        .getByText('Bilgisayar Laboratuvarı')
    ).toBeInTheDocument()

    expect(
      getEquipmentRow('Osiloskop')
        .getByText('Bakımda')
    ).toBeInTheDocument()

    expect(
      getEquipmentRow('Multimetre')
        .getByText('Arızalı')
    ).toBeInTheDocument()

    expect(
      getEquipmentRow('Multimetre')
        .getByText('Elektronik Laboratuvarı')
    ).toBeInTheDocument()
  })

  it('displays an empty equipment state', async () => {
    renderEquipment([])

    expect(
      await screen.findByText(
        'Henüz kayıtlı ekipmanınız bulunmuyor.'
      )
    ).toBeInTheDocument()
  })

  it('disables equipment creation without laboratories', async () => {
    renderEquipment([], [])

    expect(
      await screen.findByText(
        'Önce bir laboratuvar oluşturmalısınız.'
      )
    ).toBeInTheDocument()

    expect(
      screen.getByRole('button', {
        name: '+ Ekipman Ekle',
      })
    ).toBeDisabled()
  })

  it('opens the create form with laboratory options', async () => {
    const { user } = renderEquipment()

    await openCreateForm(user)

    expect(
      screen.getByRole('heading', {
        name: 'Yeni Ekipman',
      })
    ).toBeInTheDocument()

    const select = screen.getByLabelText(
      'Bağlı Laboratuvar'
    )

    expect(
      within(select).getByRole('option', {
        name: 'Bilgisayar Laboratuvarı',
      })
    ).toHaveValue('1')

    expect(
      within(select).getByRole('option', {
        name: 'Elektronik Laboratuvarı',
      })
    ).toHaveValue('2')

    expect(
      screen.getByLabelText('Durum')
    ).toHaveValue('available')
  })

  it('resets the form when cancelled', async () => {
    const { user } = renderEquipment()

    await openCreateForm(user)
    await fillForm(user)

    await user.click(
      screen.getByRole('button', { name: 'İptal' })
    )

    expect(
      screen.queryByLabelText('Ekipman Adı')
    ).not.toBeInTheDocument()

    await openCreateForm(user)

    expect(
      screen.getByLabelText('Ekipman Adı')
    ).toHaveValue('')

    expect(
      screen.getByLabelText('Seri Numarası')
    ).toHaveValue('')

    expect(
      screen.getByLabelText('Bağlı Laboratuvar')
    ).toHaveValue('')
  })

  it('creates equipment and updates the table', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        id: 4,
        name: 'Test Ekipmanı',
        serial_number: 'TEST-001',
        status: 'available',
        laboratory_id: 1,
      },
    })

    const { user } = renderEquipment()

    await openCreateForm(user)
    await fillForm(user)
    await submitForm(user)

    expect(api.post).toHaveBeenCalledWith(
      '/equipment',
      {
        name: 'Test Ekipmanı',
        serial_number: 'TEST-001',
        status: 'available',
        laboratory_id: 1,
      }
    )

    expect(
      await screen.findByText('Test Ekipmanı')
    ).toBeInTheDocument()

    expect(
      screen.getByText('3D Yazıcı')
    ).toBeInTheDocument()

    expect(
      screen.queryByLabelText('Ekipman Adı')
    ).not.toBeInTheDocument()
  })

  it('trims input values and sends a numeric laboratory ID', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        id: 4,
        name: 'Test Ekipmanı',
        serial_number: 'TEST-002',
        status: 'broken',
        laboratory_id: 2,
      },
    })

    const { user } = renderEquipment()

    await openCreateForm(user)

    await fillForm(
      user,
      '  Test Ekipmanı  ',
      '  TEST-002  ',
      'broken',
      '2'
    )

    await submitForm(user)

    expect(api.post).toHaveBeenCalledWith(
      '/equipment',
      {
        name: 'Test Ekipmanı',
        serial_number: 'TEST-002',
        status: 'broken',
        laboratory_id: 2,
      }
    )
  })

  it('rejects whitespace-only equipment names', async () => {
    const { user } = renderEquipment()

    await openCreateForm(user)
    await fillForm(user, '   ')
    await submitForm(user)

    expect(
      screen.getByText('Lütfen tüm alanları doldurun.')
    ).toBeInTheDocument()

    expect(api.post).not.toHaveBeenCalled()
  })

  it('prevents submission without a laboratory selection', async () => {
    const { user } = renderEquipment()

    await openCreateForm(user)

    await user.type(
      screen.getByLabelText('Ekipman Adı'),
      'Test Ekipmanı'
    )

    await user.type(
      screen.getByLabelText('Seri Numarası'),
      'TEST-001'
    )

    await submitForm(user)

    expect(api.post).not.toHaveBeenCalled()

    expect(
      screen.getByLabelText('Bağlı Laboratuvar')
    ).toBeInvalid()
  })

  it('opens the edit form with existing equipment values', async () => {
    const { user } = renderEquipment()

    await screen.findByText('Osiloskop')

    await user.click(
      getEquipmentRow('Osiloskop')
        .getByRole('button', { name: 'Düzenle' })
    )

    expect(
      screen.getByRole('heading', {
        name: 'Ekipmanı Düzenle',
      })
    ).toBeInTheDocument()

    expect(
      screen.getByLabelText('Ekipman Adı')
    ).toHaveValue('Osiloskop')

    expect(
      screen.getByLabelText('Seri Numarası')
    ).toHaveValue('OSC-001')

    expect(
      screen.getByLabelText('Durum')
    ).toHaveValue('maintenance')

    expect(
      screen.getByLabelText('Bağlı Laboratuvar')
    ).toHaveValue('2')
  })

  it('updates equipment status and laboratory', async () => {
    api.put.mockResolvedValueOnce({
      data: {
        id: 1,
        name: '3D Yazıcı',
        serial_number: 'PRN-001',
        status: 'maintenance',
        laboratory_id: 2,
      },
    })

    const { user } = renderEquipment()

    await screen.findByText('3D Yazıcı')

    await user.click(
      getEquipmentRow('3D Yazıcı')
        .getByRole('button', { name: 'Düzenle' })
    )

    await user.selectOptions(
      screen.getByLabelText('Durum'),
      'maintenance'
    )

    await user.selectOptions(
      screen.getByLabelText('Bağlı Laboratuvar'),
      '2'
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Değişiklikleri Kaydet',
      })
    )

    expect(api.put).toHaveBeenCalledWith(
      '/equipment/1',
      {
        name: '3D Yazıcı',
        serial_number: 'PRN-001',
        status: 'maintenance',
        laboratory_id: 2,
      }
    )

    expect(
      getEquipmentRow('3D Yazıcı').getByText('Bakımda')
    ).toBeInTheDocument()

    expect(
      getEquipmentRow('3D Yazıcı')
        .getByText('Elektronik Laboratuvarı')
    ).toBeInTheDocument()
  })

  it('deletes equipment after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    api.delete.mockResolvedValueOnce({ data: {} })

    const { user } = renderEquipment()

    await screen.findByText('3D Yazıcı')

    await user.click(
      getEquipmentRow('3D Yazıcı')
        .getByRole('button', { name: 'Sil' })
    )

    expect(api.delete).toHaveBeenCalledWith('/equipment/1')

    expect(
      screen.queryByText('3D Yazıcı')
    ).not.toBeInTheDocument()

    expect(
      screen.getByText('Osiloskop')
    ).toBeInTheDocument()
  })

  it('does not delete equipment when cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    const { user } = renderEquipment()

    await screen.findByText('3D Yazıcı')

    await user.click(
      getEquipmentRow('3D Yazıcı')
        .getByRole('button', { name: 'Sil' })
    )

    expect(api.delete).not.toHaveBeenCalled()

    expect(
      screen.getByText('3D Yazıcı')
    ).toBeInTheDocument()
  })

  it('handles duplicate serial number errors', async () => {
    api.post.mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          detail: 'This serial number already exists',
        },
      },
    })

    const { user } = renderEquipment()

    await openCreateForm(user)

    await fillForm(
      user,
      'Test Ekipmanı',
      'PRN-001'
    )

    await submitForm(user)

    expect(
      await screen.findByText(
        'This serial number already exists'
      )
    ).toBeInTheDocument()

    expect(
      screen.getByLabelText('Seri Numarası')
    ).toHaveValue('PRN-001')
  })

  it('handles deletion conflicts caused by maintenance records', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    api.delete.mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          detail: 'Cannot delete equipment with maintenance records',
        },
      },
    })

    const { user } = renderEquipment()

    await screen.findByText('Osiloskop')

    await user.click(
      getEquipmentRow('Osiloskop')
        .getByRole('button', { name: 'Sil' })
    )

    expect(
      await screen.findByText(
        'Cannot delete equipment with maintenance records'
      )
    ).toBeInTheDocument()

    expect(
      screen.getByText('Osiloskop')
    ).toBeInTheDocument()
  })

  it('handles API loading errors', async () => {
    api.get.mockRejectedValue(
      new Error('Network Error')
    )

    render(<Equipment />)

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
              loc: ['body', 'name'],
              msg: 'Invalid input',
            },
          ],
        },
      },
    })

    const { user } = renderEquipment()

    await openCreateForm(user)
    await fillForm(user)
    await submitForm(user)

    expect(
      await screen.findByText(
        'Girdiğiniz bilgileri kontrol edin.'
      )
    ).toBeInTheDocument()

    expect(
      screen.getByLabelText('Ekipman Adı')
    ).toHaveValue('Test Ekipmanı')

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

    const { user } = renderEquipment()

    await openCreateForm(user)
    await fillForm(user)
    await submitForm(user)

    expect(
      screen.getByRole('button', {
        name: 'Kaydediliyor...',
      })
    ).toBeDisabled()

    resolveRequest({
      data: {
        id: 4,
        name: 'Test Ekipmanı',
        serial_number: 'TEST-001',
        status: 'available',
        laboratory_id: 1,
      },
    })

    expect(
      await screen.findByText('Test Ekipmanı')
    ).toBeInTheDocument()
  })
})
