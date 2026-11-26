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
  act,
} from '@testing-library/react'

import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import Dashboard from '../pages/Dashboard'
import Equipment from '../pages/Equipment'
import Laboratories from '../pages/Laboratories'
import Maintenance from '../pages/Maintenance'
import Settings from '../pages/Settings'
import api from '../services/api'

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

function deferredRequest() {
  let resolve
  let reject

  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })

  return {
    promise,
    resolve,
    reject,
  }
}

describe('Application edge cases', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
    api.put.mockReset()
    api.delete.mockReset()
  })

  // DASHBOARD

  it('handles a successful dashboard request after unmount', async () => {
    const request = deferredRequest()

    api.get.mockReturnValueOnce(
      request.promise
    )

    const { unmount, container } = render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    expect(api.get).toHaveBeenCalledWith(
      '/dashboard'
    )

    expect(
      screen.getByText('Dashboard yükleniyor...')
    ).toBeInTheDocument()

    unmount()

    await act(async () => {
      request.resolve({ data: null })
    })

    expect(container).toBeEmptyDOMElement()
  })

  it('handles a failed dashboard request after unmount', async () => {
    const request = deferredRequest()

    api.get.mockReturnValueOnce(
      request.promise
    )

    const { unmount, container } = render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    expect(api.get).toHaveBeenCalledWith(
      '/dashboard'
    )

    unmount()

    await act(async () => {
      request.reject(
        new Error('Network Error')
      )
    })

    expect(container).toBeEmptyDOMElement()
  })

  // EQUIPMENT

  it('displays fallback values for unknown equipment status and laboratory', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/equipment') {
        return {
          data: [
            {
              id: 1,
              name: 'Test Ekipmanı',
              serial_number: 'TEST-001',
              status: 'unknown-status',
              laboratory_id: 999,
            },
          ],
        }
      }

      if (url === '/laboratories') {
        return {
          data: [
            {
              id: 1,
              name: 'Test Laboratuvarı',
              location: null,
            },
          ],
        }
      }

      throw new Error(`Unexpected URL: ${url}`)
    })

    render(<Equipment />)

    const row = await screen.findByRole('row', {
      name: /Test Ekipmanı/,
    })

    expect(
      within(row).getByText('unknown-status')
    ).toBeInTheDocument()

    expect(
      within(row).getByText('Bilinmiyor')
    ).toBeInTheDocument()
  })

  // LABORATORIES

  it('opens the edit form with an empty optional location', async () => {
    api.get.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          name: 'Test Laboratuvarı',
          location: null,
        },
      ],
    })

    const user = userEvent.setup()

    render(<Laboratories />)

    const row = await screen.findByRole('row', {
      name: /Test Laboratuvarı/,
    })

    await user.click(
      within(row).getByRole('button', {
        name: 'Düzenle',
      })
    )

    expect(
      screen.getByLabelText('Laboratuvar Adı')
    ).toHaveValue('Test Laboratuvarı')

    expect(
      screen.getByLabelText('Konum')
    ).toHaveValue('')
  })

  // MAINTENANCE

  it('opens the edit form with empty optional maintenance fields', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/maintenance') {
        return {
          data: [
            {
              id: 1,
              equipment_id: 1,
              maintenance_date: '2026-11-26',
              description: 'Test Bakımı',
              technician: null,
              cost: null,
            },
          ],
        }
      }

      if (url === '/equipment') {
        return {
          data: [
            {
              id: 1,
              name: 'Test Ekipmanı',
              serial_number: 'TEST-001',
            },
          ],
        }
      }

      throw new Error(`Unexpected URL: ${url}`)
    })

    const user = userEvent.setup()

    render(<Maintenance />)

    const row = await screen.findByRole('row', {
      name: /Test Bakımı/,
    })

    await user.click(
      within(row).getByRole('button', {
        name: 'Düzenle',
      })
    )

    expect(
      screen.getByLabelText('Teknisyen')
    ).toHaveValue('')

    expect(
      screen.getByLabelText('Maliyet')
    ).toHaveValue(null)
  })

  it('displays an equipment ID when its name is unavailable', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/maintenance') {
        return {
          data: [
            {
              id: 1,
              equipment_id: 999,
              maintenance_date: '2026-11-26',
              description: 'Test Bakımı',
              technician: null,
              cost: null,
            },
          ],
        }
      }

      if (url === '/equipment') {
        return {
          data: [
            {
              id: 1,
              name: 'Test Ekipmanı',
              serial_number: 'TEST-001',
            },
          ],
        }
      }

      throw new Error(`Unexpected URL: ${url}`)
    })

    render(<Maintenance />)

    const row = await screen.findByRole('row', {
      name: /Test Bakımı/,
    })

    expect(
      within(row).getByText('Ekipman #999')
    ).toBeInTheDocument()
  })

  // SETTINGS

  it('handles a successful profile request after unmount', async () => {
    const request = deferredRequest()
    const onLogout = vi.fn()

    api.get.mockReturnValueOnce(
      request.promise
    )

    const { unmount, container } = render(
      <Settings onLogout={onLogout} />
    )

    expect(api.get).toHaveBeenCalledWith(
      '/users/me'
    )

    unmount()

    await act(async () => {
      request.resolve({
        data: {
          id: 1,
          email: 'test@example.com',
          is_active: true,
          created_at: '2026-11-01T12:00:00Z',
        },
      })
    })

    expect(container).toBeEmptyDOMElement()
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('handles a failed profile request after unmount', async () => {
    const request = deferredRequest()
    const onLogout = vi.fn()

    api.get.mockReturnValueOnce(
      request.promise
    )

    const { unmount, container } = render(
      <Settings onLogout={onLogout} />
    )

    expect(api.get).toHaveBeenCalledWith(
      '/users/me'
    )

    unmount()

    await act(async () => {
      request.reject(
        new Error('Network Error')
      )
    })

    expect(container).toBeEmptyDOMElement()
    expect(onLogout).not.toHaveBeenCalled()
  })
})
