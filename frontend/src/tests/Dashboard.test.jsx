import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Dashboard from '../pages/Dashboard'
import api from '../services/api'

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

const mockDashboard = {
  user_email: 'test@example.com',

  stats: {
    total_laboratories: 2,
    total_equipment: 10,
    available_equipment: 6,
    maintenance_equipment: 3,
    broken_equipment: 1,
    total_maintenance_records: 2,
    total_maintenance_cost: '600.75',
  },

  laboratories: [
    {
      id: 1,
      name: 'Bilgisayar Laboratuvarı',
      location: 'A Blok',
      equipment_count: 7,
    },
    {
      id: 2,
      name: 'Elektronik Laboratuvarı',
      location: null,
      equipment_count: 3,
    },
  ],

  recent_maintenance: [
    {
      id: 1,
      equipment_id: 1,
      equipment_name: '3D Yazıcı',
      maintenance_date: '2026-11-26',
      description: 'Periyodik bakım yapıldı.',
      technician: 'Test Technician',
      cost: '250.50',
    },
    {
      id: 2,
      equipment_id: 2,
      equipment_name: 'Osiloskop',
      maintenance_date: '2026-11-25',
      description: 'Kalibrasyon yapıldı.',
      technician: null,
      cost: null,
    },
  ],
}

const emptyDashboard = {
  user_email: 'test@example.com',

  stats: {
    total_laboratories: 0,
    total_equipment: 0,
    available_equipment: 0,
    maintenance_equipment: 0,
    broken_equipment: 0,
    total_maintenance_records: 0,
    total_maintenance_cost: '0.00',
  },

  laboratories: [],
  recent_maintenance: [],
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  )
}

function formatCurrency(value) {
  return Number(value).toLocaleString('tr-TR', {
    style: 'currency',
    currency: 'TRY',
  })
}

function getStatCard(label) {
  return within(
    screen.getByText(label, { exact: true })
      .closest('.stat-card')
  )
}

describe('Dashboard component', () => {
  beforeEach(() => {
    api.get.mockReset()
  })

  it('displays loading state while fetching data', () => {
    api.get.mockImplementationOnce(
      () => new Promise(() => {})
    )

    renderDashboard()

    expect(
      screen.getByText('Dashboard yükleniyor...')
    ).toBeInTheDocument()

    expect(api.get).toHaveBeenCalledWith('/dashboard')
  })

  it('renders dashboard after successful API request', async () => {
    api.get.mockResolvedValueOnce({
      data: mockDashboard,
    })

    renderDashboard()

    expect(
      await screen.findByRole('heading', {
        name: 'Dashboard',
      })
    ).toBeInTheDocument()

    expect(api.get).toHaveBeenCalledTimes(1)

    expect(
      screen.queryByText('Dashboard yükleniyor...')
    ).not.toBeInTheDocument()
  })

  it('displays the current user email', async () => {
    api.get.mockResolvedValueOnce({
      data: mockDashboard,
    })

    renderDashboard()

    expect(
      await screen.findByText('test@example.com')
    ).toBeInTheDocument()

    expect(
      screen.getByText('Kullanıcı')
    ).toBeInTheDocument()
  })

  it('displays all dashboard statistics correctly', async () => {
    api.get.mockResolvedValueOnce({
      data: mockDashboard,
    })

    renderDashboard()

    await screen.findByText('Toplam Laboratuvar')

    const expectedStats = [
      ['Toplam Laboratuvar', '2'],
      ['Toplam Ekipman', '10'],
      ['Aktif Ekipman', '6'],
      ['Bakımda', '3'],
      ['Arızalı Ekipman', '1'],
      ['Bakım Kayıtları', '2'],
    ]

    for (const [label, value] of expectedStats) {
      expect(
        getStatCard(label).getByText(value, {
          exact: true,
        })
      ).toBeInTheDocument()
    }
  })

  it('formats total maintenance cost as Turkish currency', async () => {
    api.get.mockResolvedValueOnce({
      data: mockDashboard,
    })

    renderDashboard()

    await screen.findByText('Toplam Bakım Maliyeti')

    expect(
      getStatCard('Toplam Bakım Maliyeti').getByText(
        formatCurrency(600.75)
      )
    ).toBeInTheDocument()
  })

  it('displays laboratory names and equipment counts', async () => {
    api.get.mockResolvedValueOnce({
      data: mockDashboard,
    })

    renderDashboard()

    const table = await screen.findByRole('table')

    const computerLab = within(table).getByRole('row', {
      name: /Bilgisayar Laboratuvarı/,
    })

    expect(
      within(computerLab).getByText('A Blok')
    ).toBeInTheDocument()

    expect(
      within(computerLab).getByText('7')
    ).toBeInTheDocument()

    const electronicsLab = within(table).getByRole('row', {
      name: /Elektronik Laboratuvarı/,
    })

    expect(
      within(electronicsLab).getByText('3')
    ).toBeInTheDocument()

    expect(
      within(electronicsLab).getByText('—')
    ).toBeInTheDocument()
  })

  it('displays recent maintenance records', async () => {
    api.get.mockResolvedValueOnce({
      data: mockDashboard,
    })

    renderDashboard()

    expect(
      await screen.findByText('3D Yazıcı')
    ).toBeInTheDocument()

    expect(
      screen.getByText('Periyodik bakım yapıldı.')
    ).toBeInTheDocument()

    expect(
      screen.getByText('26.11.2026')
    ).toBeInTheDocument()

    expect(
      screen.getByText(formatCurrency(250.50))
    ).toBeInTheDocument()

    expect(
      screen.getByText('Osiloskop')
    ).toBeInTheDocument()

    expect(
      screen.getByText('Kalibrasyon yapıldı.')
    ).toBeInTheDocument()
  })

  it('does not display a cost for null maintenance cost', async () => {
    api.get.mockResolvedValueOnce({
      data: mockDashboard,
    })

    renderDashboard()

    const equipment = await screen.findByText('Osiloskop')

    const record = within(
      equipment.closest('.activity-item')
    )

    expect(
      record.queryByText(/₺/)
    ).not.toBeInTheDocument()
  })

  it('displays empty states when no records exist', async () => {
    api.get.mockResolvedValueOnce({
      data: emptyDashboard,
    })

    renderDashboard()

    expect(
      await screen.findByText(
        'Henüz kayıtlı laboratuvar bulunmuyor.'
      )
    ).toBeInTheDocument()

    expect(
      screen.getByText(
        'Henüz bakım kaydı bulunmuyor.'
      )
    ).toBeInTheDocument()

    expect(
      getStatCard('Toplam Laboratuvar').getByText('0')
    ).toBeInTheDocument()

    expect(
      getStatCard('Toplam Ekipman').getByText('0')
    ).toBeInTheDocument()
  })

  it('handles API connection errors', async () => {
    api.get.mockRejectedValueOnce(
      new Error('Network Error')
    )

    renderDashboard()

    expect(
      await screen.findByText(
        'Dashboard verileri yüklenemedi.'
      )
    ).toBeInTheDocument()

    expect(
      screen.queryByText('Dashboard yükleniyor...')
    ).not.toBeInTheDocument()
  })

  it('handles missing dashboard data', async () => {
    api.get.mockResolvedValueOnce({
      data: null,
    })

    renderDashboard()

    expect(
      await screen.findByText(
        'Dashboard verisi bulunamadı.'
      )
    ).toBeInTheDocument()
  })

  it('provides correct laboratory and maintenance links', async () => {
    api.get.mockResolvedValueOnce({
      data: mockDashboard,
    })

    renderDashboard()

    await screen.findByRole('heading', {
      name: 'Dashboard',
    })

    const links = screen.getAllByRole('link', {
      name: /Tümünü Gör/,
    })

    expect(links).toHaveLength(2)

    expect(links[0]).toHaveAttribute(
      'href',
      '/laboratories'
    )

    expect(links[1]).toHaveAttribute(
      'href',
      '/maintenance'
    )
  })
})

describe('Dashboard rate limiting and service availability', () => {
  beforeEach(() => {
    api.get.mockReset()
  })

  it.each([
    [
      429,
      { 'retry-after': '30' },
      'Çok fazla işlem yaptınız. Lütfen 30 saniye sonra tekrar deneyin.',
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
  ])(
    'handles dashboard error %s with headers %j',
    async (status, headers, message) => {
      api.get.mockRejectedValueOnce({
        response: { status, headers },
      })

      renderDashboard()

      expect(
        await screen.findByText(message)
      ).toBeInTheDocument()

      expect(
        screen.queryByText('Dashboard yükleniyor...')
      ).not.toBeInTheDocument()

      expect(api.get).toHaveBeenCalledTimes(1)
    }
  )
})
