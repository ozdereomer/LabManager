import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'

import {
  createAuthenticatedUser,
  waitForApiResponse,
} from './helpers.js'

function formatCurrency(value) {
  return Number(value).toLocaleString('tr-TR', {
    style: 'currency',
    currency: 'TRY',
  })
}

async function authenticatedHeaders(page) {
  const token = await page.evaluate(
    () => localStorage.getItem('access_token')
  )

  expect(Boolean(token)).toBe(true)

  return {
    Authorization: `Bearer ${token}`,
  }
}

async function createLab(page, request, name, location = null) {
  const response = await request.post('/api/laboratories', {
    headers: await authenticatedHeaders(page),
    data: { name, location },
  })

  expect(response.status()).toBe(201)

  return response.json()
}

async function createEquipment(
  page, request, lab, name, status = 'available'
) {
  const response = await request.post('/api/equipment', {
    headers: await authenticatedHeaders(page),
    data: {
      name,
      serial_number: `E2E-${randomUUID()}`,
      status,
      laboratory_id: lab.id,
    },
  })

  expect(response.status()).toBe(201)

  return response.json()
}

async function createMaintenance(
  page, request, item, overrides = {}
) {
  const response = await request.post('/api/maintenance', {
    headers: await authenticatedHeaders(page),
    data: {
      equipment_id: item.id,
      maintenance_date: '2026-11-26',
      description: 'Periyodik bakım',
      technician: 'Test Teknisyen',
      cost: 250.50,
      ...overrides,
    },
  })

  expect(response.status()).toBe(201)

  return response.json()
}

async function openDashboard(page) {
  const [response] = await Promise.all([
    waitForApiResponse(page, '/dashboard', 'GET'),
    page.goto('/'),
  ])

  expect(response.status()).toBe(200)

  await expect(
    page.getByRole('heading', {
      name: 'Dashboard',
      exact: true,
    })
  ).toBeVisible()

  return response.json()
}

function statValue(page, label) {
  return page.locator('.stat-card').filter({
    has: page.getByText(label, { exact: true }),
  }).locator('.stat-value')
}

async function expectStats(page, stats) {
  for (const [label, value] of Object.entries(stats)) {
    await expect(
      statValue(page, label)
    ).toHaveText(String(value))
  }
}

function labRow(page, name) {
  return page.getByRole('row').filter({
    has: page.getByRole('cell', {
      name,
      exact: true,
    }),
  })
}

function activityItem(page, description) {
  return page.locator('.activity-item').filter({
    has: page.getByText(description, { exact: true }),
  })
}

test('new user dashboard displays zero statistics and empty states', async ({ page, request }) => {
  const user = await createAuthenticatedUser(page, request)

  const dashboard = await openDashboard(page)

  expect(dashboard.user_email).toBe(user.email)

  expect(dashboard.stats).toMatchObject({
    total_laboratories: 0,
    total_equipment: 0,
    available_equipment: 0,
    maintenance_equipment: 0,
    broken_equipment: 0,
    total_maintenance_records: 0,
  })

  expect(Number(
    dashboard.stats.total_maintenance_cost
  )).toBe(0)

  expect(dashboard.laboratories).toEqual([])
  expect(dashboard.recent_maintenance).toEqual([])

  await expect(
    page.getByText(user.email, { exact: true })
  ).toBeVisible()

  await expectStats(page, {
    'Toplam Laboratuvar': 0,
    'Toplam Ekipman': 0,
    'Aktif Ekipman': 0,
    'Bakımda': 0,
    'Arızalı Ekipman': 0,
    'Bakım Kayıtları': 0,
    'Toplam Bakım Maliyeti': formatCurrency(0),
  })

  await expect(
    page.getByText('Henüz kayıtlı laboratuvar bulunmuyor.')
  ).toBeVisible()

  await expect(
    page.getByText('Henüz bakım kaydı bulunmuyor.')
  ).toBeVisible()
})

test('dashboard calculates equipment status statistics correctly', async ({ page, request }) => {
  await createAuthenticatedUser(page, request)

  const first = await createLab(
    page, request, 'Bilgisayar Laboratuvarı'
  )

  const second = await createLab(
    page, request, 'Elektronik Laboratuvarı'
  )

  await createEquipment(
    page, request, first, 'Bilgisayar 1'
  )

  await createEquipment(
    page, request, first, 'Bilgisayar 2'
  )

  await createEquipment(
    page, request, second, 'Osiloskop', 'maintenance'
  )

  await createEquipment(
    page, request, second, 'Multimetre', 'broken'
  )

  const dashboard = await openDashboard(page)

  expect(dashboard.stats).toMatchObject({
    total_laboratories: 2,
    total_equipment: 4,
    available_equipment: 2,
    maintenance_equipment: 1,
    broken_equipment: 1,
  })

  await expectStats(page, {
    'Toplam Laboratuvar': 2,
    'Toplam Ekipman': 4,
    'Aktif Ekipman': 2,
    'Bakımda': 1,
    'Arızalı Ekipman': 1,
  })
})

test('dashboard calculates maintenance count and total cost', async ({ page, request }) => {
  await createAuthenticatedUser(page, request)

  const lab = await createLab(
    page, request, 'Bakım Laboratuvarı'
  )

  const item = await createEquipment(
    page, request, lab, '3D Yazıcı'
  )

  for (const [description, cost] of [
    ['Birinci bakım', 250.50],
    ['İkinci bakım', 350.25],
    ['Ücretsiz bakım', 0],
    ['Maliyetsiz bakım', null],
  ]) {
    await createMaintenance(page, request, item, {
      description,
      cost,
    })
  }

  const dashboard = await openDashboard(page)

  expect(
    dashboard.stats.total_maintenance_records
  ).toBe(4)

  expect(Number(
    dashboard.stats.total_maintenance_cost
  )).toBe(600.75)

  await expectStats(page, {
    'Bakım Kayıtları': 4,
    'Toplam Bakım Maliyeti': formatCurrency(600.75),
  })

  await expect(
    activityItem(page, 'Ücretsiz bakım')
      .getByText(formatCurrency(0), { exact: true })
  ).toBeVisible()

  await expect(
    activityItem(page, 'Maliyetsiz bakım')
      .getByText(/₺/)
  ).toHaveCount(0)
})

test('dashboard displays laboratory equipment counts including empty laboratories', async ({ page, request }) => {
  await createAuthenticatedUser(page, request)

  const first = await createLab(
    page, request, 'Bilgisayar Laboratuvarı', 'A Blok'
  )

  const second = await createLab(
    page, request, 'Elektronik Laboratuvarı', 'B Blok'
  )

  const empty = await createLab(
    page, request, 'Boş Laboratuvar'
  )

  await createEquipment(
    page, request, first, 'Bilgisayar 1'
  )

  await createEquipment(
    page, request, first, 'Bilgisayar 2'
  )

  await createEquipment(
    page, request, second, 'Osiloskop'
  )

  const dashboard = await openDashboard(page)

  expect(dashboard.laboratories).toEqual([
    { ...first, equipment_count: 2 },
    { ...second, equipment_count: 1 },
    { ...empty, equipment_count: 0 },
  ])

  for (const [name, location, count] of [
    [first.name, 'A Blok', '2'],
    [second.name, 'B Blok', '1'],
    [empty.name, '—', '0'],
  ]) {
    const row = labRow(page, name)

    await expect(row.getByRole('cell', {
      name: location,
      exact: true,
    })).toBeVisible()

    await expect(row.getByRole('cell', {
      name: count,
      exact: true,
    })).toBeVisible()
  }
})

test('dashboard displays only five latest maintenance records in correct order', async ({ page, request }) => {
  await createAuthenticatedUser(page, request)

  const lab = await createLab(
    page, request, 'Bakım Laboratuvarı'
  )

  const item = await createEquipment(
    page, request, lab, '3D Yazıcı'
  )

  const records = []

  for (const [description, date] of [
    ['Bakım A', '2026-11-20'],
    ['Bakım B', '2026-11-26'],
    ['Bakım C', '2026-11-22'],
    ['Bakım D', '2026-11-26'],
    ['Bakım E', '2026-11-24'],
    ['Bakım F', '2026-11-25'],
  ]) {
    records.push(
      await createMaintenance(page, request, item, {
        description,
        maintenance_date: date,
      })
    )
  }

  const dashboard = await openDashboard(page)

  expect(
    dashboard.stats.total_maintenance_records
  ).toBe(6)

  expect(
    dashboard.recent_maintenance.map(record => record.id)
  ).toEqual([
    records[3].id,
    records[1].id,
    records[5].id,
    records[4].id,
    records[2].id,
  ])

  await expect(
    page.locator('.activity-item')
  ).toHaveCount(5)

  await expect(
    page.locator('.activity-item .activity-time')
      .filter({ hasText: /^Bakım [A-F]$/ })
  ).toHaveText([
    'Bakım D',
    'Bakım B',
    'Bakım F',
    'Bakım E',
    'Bakım C',
  ])

  await expect(
    activityItem(page, 'Bakım D')
      .getByText('26.11.2026', { exact: true })
  ).toBeVisible()

  await expect(
    activityItem(page, 'Bakım D')
      .getByText(item.name, { exact: true })
  ).toBeVisible()

  await expect(
    activityItem(page, 'Bakım A')
  ).toHaveCount(0)
})

test('dashboard reflects equipment status changes after reload', async ({ page, request }) => {
  await createAuthenticatedUser(page, request)

  const lab = await createLab(
    page, request, 'Test Laboratuvarı'
  )

  const item = await createEquipment(
    page, request, lab, 'Osiloskop'
  )

  await openDashboard(page)

  await expectStats(page, {
    'Aktif Ekipman': 1,
    'Bakımda': 0,
    'Arızalı Ekipman': 0,
  })

  const response = await request.put(
    '/api/equipment/' + item.id,
    {
      headers: await authenticatedHeaders(page),
      data: {
        name: item.name,
        serial_number: item.serial_number,
        status: 'broken',
        laboratory_id: lab.id,
      },
    }
  )

  expect(response.status()).toBe(200)

  await page.reload()

  await expectStats(page, {
    'Toplam Ekipman': 1,
    'Aktif Ekipman': 0,
    'Bakımda': 0,
    'Arızalı Ekipman': 1,
  })
})

test('dashboard reflects maintenance updates and deletion', async ({ page, request }) => {
  await createAuthenticatedUser(page, request)

  const lab = await createLab(
    page, request, 'Test Laboratuvarı'
  )

  const item = await createEquipment(
    page, request, lab, '3D Yazıcı'
  )

  const record = await createMaintenance(
    page, request, item
  )

  await openDashboard(page)

  await expectStats(page, {
    'Bakım Kayıtları': 1,
    'Toplam Bakım Maliyeti': formatCurrency(250.50),
  })

  const headers = await authenticatedHeaders(page)

  const updated = await request.put(
    '/api/maintenance/' + record.id,
    {
      headers,
      data: {
        equipment_id: item.id,
        maintenance_date: record.maintenance_date,
        description: 'Güncellenmiş bakım',
        technician: record.technician,
        cost: 500.75,
      },
    }
  )

  expect(updated.status()).toBe(200)

  await page.reload()

  await expectStats(page, {
    'Bakım Kayıtları': 1,
    'Toplam Bakım Maliyeti': formatCurrency(500.75),
  })

  await expect(
    activityItem(page, 'Güncellenmiş bakım')
  ).toBeVisible()

  const deleted = await request.delete(
    '/api/maintenance/' + record.id,
    { headers }
  )

  expect(deleted.status()).toBe(200)

  await page.reload()

  await expectStats(page, {
    'Bakım Kayıtları': 0,
    'Toplam Bakım Maliyeti': formatCurrency(0),
  })

  await expect(
    page.getByText('Henüz bakım kaydı bulunmuyor.')
  ).toBeVisible()
})

test('dashboard navigation links open correct pages', async ({ page, request }) => {
  await createAuthenticatedUser(page, request)

  await openDashboard(page)

  const labLink = page.locator('.panel-link')
    .filter({ hasText: 'Tümünü Gör' })
    .and(page.locator('a[href="/laboratories"]'))

  await labLink.click()

  await expect(page).toHaveURL(/\/laboratories$/)

  await expect(
    page.getByRole('heading', {
      name: 'Laboratuvarlar',
      exact: true,
    })
  ).toBeVisible()

  await openDashboard(page)

  const maintenanceLink = page.locator('.panel-link')
    .filter({ hasText: 'Tümünü Gör' })
    .and(page.locator('a[href="/maintenance"]'))

  await maintenanceLink.click()

  await expect(page).toHaveURL(/\/maintenance$/)

  await expect(
    page.getByRole('heading', {
      name: 'Bakım Takibi',
      exact: true,
    })
  ).toBeVisible()
})
