import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'

import {
  createUser,
  login,
  logout,
  waitForApiResponse,
} from './helpers.js'

async function getHeaders(page) {
  const token = await page.evaluate(
    () => localStorage.getItem('access_token')
  )

  expect(Boolean(token)).toBe(true)

  return {
    Authorization: `Bearer ${token}`,
  }
}

async function apiRequest(
  request, headers, method, path, status, data
) {
  const response = await request.fetch('/api' + path, {
    method,
    headers,
    ...(data === undefined ? {} : { data }),
  })

  expect(
    response.status(),
    `${method} ${path}`
  ).toBe(status)

  const body = await response.json()

  await response.dispose()

  return body
}

async function createResources(
  request, headers, prefix, status, cost
) {
  const lab = await apiRequest(
    request, headers, 'POST', '/laboratories', 201,
    {
      name: `${prefix} Laboratuvarı`,
      location: `${prefix} Konumu`,
    }
  )

  const equipment = await apiRequest(
    request, headers, 'POST', '/equipment', 201,
    {
      name: `${prefix} Ekipmanı`,
      serial_number: `E2E-${randomUUID()}`,
      status,
      laboratory_id: lab.id,
    }
  )

  const maintenance = await apiRequest(
    request, headers, 'POST', '/maintenance', 201,
    {
      equipment_id: equipment.id,
      maintenance_date: '2026-11-28',
      description: `${prefix} Bakım Kaydı`,
      technician: `${prefix} Teknisyen`,
      cost,
    }
  )

  return { lab, equipment, maintenance }
}

async function withTwoUsers(
  page, request, browser, callback
) {
  const userA = await createUser(request)
  const userB = await createUser(request)

  expect(userA.id).not.toBe(userB.id)

  await login(page, userA)

  const contextB = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  })

  try {
    const pageB = await contextB.newPage()

    await login(pageB, userB)

    const headersA = await getHeaders(page)
    const headersB = await getHeaders(pageB)

    const dataA = await createResources(
      request, headersA, 'Kullanıcı A', 'available', 125.50
    )

    const dataB = await createResources(
      request, headersB, 'Kullanıcı B', 'broken', 875.25
    )

    await callback({
      userA,
      userB,
      pageA: page,
      pageB,
      headersA,
      headersB,
      dataA,
      dataB,
    })
  } finally {
    await contextB.close()
  }
}

async function openResourcePage(page, path) {
  const [response] = await Promise.all([
    waitForApiResponse(page, path, 'GET'),
    page.goto(path),
  ])

  expect(response.status()).toBe(200)

  return response.json()
}

async function expectVisibleOnly(page, own, foreign) {
  await expect(
    page.getByText(own, { exact: true })
  ).toBeVisible()

  await expect(
    page.getByText(foreign, { exact: true })
  ).toHaveCount(0)
}

async function expectNotFound(
  request, headers, method, path, detail, data
) {
  const result = await apiRequest(
    request, headers, method, path, 404, data
  )

  expect(result.detail).toBe(detail)
}

async function expectUnchanged(request, headers, data) {
  for (const [path, record] of [
    ['/laboratories', data.lab],
    ['/equipment', data.equipment],
    ['/maintenance', data.maintenance],
  ]) {
    const records = await apiRequest(
      request, headers, 'GET', path, 200
    )

    expect(records).toEqual([record])
  }
}

function equipmentPayload(item, overrides = {}) {
  return {
    name: item.name,
    serial_number: item.serial_number,
    status: item.status,
    laboratory_id: item.laboratory_id,
    ...overrides,
  }
}

function maintenancePayload(record, overrides = {}) {
  return {
    equipment_id: record.equipment_id,
    maintenance_date: record.maintenance_date,
    description: record.description,
    technician: record.technician,
    cost: record.cost,
    ...overrides,
  }
}

test('laboratory lists are isolated between users', async ({ page, request, browser }) => {
  await withTwoUsers(page, request, browser, async ({
    pageA, pageB, dataA, dataB,
  }) => {
    expect(
      await openResourcePage(pageA, '/laboratories')
    ).toEqual([dataA.lab])

    await expectVisibleOnly(
      pageA, dataA.lab.name, dataB.lab.name
    )

    expect(
      await openResourcePage(pageB, '/laboratories')
    ).toEqual([dataB.lab])

    await expectVisibleOnly(
      pageB, dataB.lab.name, dataA.lab.name
    )
  })
})

test('equipment lists and filters cannot expose another user equipment', async ({ page, request, browser }) => {
  await withTwoUsers(page, request, browser, async ({
    pageA, pageB, headersA, headersB, dataA, dataB,
  }) => {
    for (const [currentPage, headers, own, foreign] of [
      [pageA, headersA, dataA, dataB],
      [pageB, headersB, dataB, dataA],
    ]) {
      expect(
        await openResourcePage(currentPage, '/equipment')
      ).toEqual([own.equipment])

      await expectVisibleOnly(
        currentPage,
        own.equipment.name,
        foreign.equipment.name
      )

      for (const query of [
        'laboratory_id=' + foreign.lab.id,
        'name=' + encodeURIComponent(foreign.equipment.name),
        'serial_number=' + foreign.equipment.serial_number,
        'status=' + foreign.equipment.status,
      ]) {
        const result = await apiRequest(
          request, headers, 'GET',
          '/equipment?' + query, 200
        )

        expect(result).toEqual([])
      }

      const ownEquipment = await apiRequest(
        request, headers, 'GET',
        `/laboratories/${own.lab.id}/equipment`, 200
      )

      expect(ownEquipment).toEqual([own.equipment])

      await expectNotFound(
        request, headers, 'GET',
        `/laboratories/${foreign.lab.id}/equipment`,
        'Laboratory not found'
      )
    }
  })
})

test('maintenance records and equipment filters are isolated', async ({ page, request, browser }) => {
  await withTwoUsers(page, request, browser, async ({
    pageA, pageB, headersA, headersB, dataA, dataB,
  }) => {
    for (const [currentPage, headers, own, foreign] of [
      [pageA, headersA, dataA, dataB],
      [pageB, headersB, dataB, dataA],
    ]) {
      expect(
        await openResourcePage(currentPage, '/maintenance')
      ).toEqual([own.maintenance])

      await expectVisibleOnly(
        currentPage,
        own.maintenance.description,
        foreign.maintenance.description
      )

      const ownRecords = await apiRequest(
        request, headers, 'GET',
        `/maintenance?equipment_id=${own.equipment.id}`,
        200
      )

      expect(ownRecords).toEqual([own.maintenance])

      const foreignRecords = await apiRequest(
        request, headers, 'GET',
        `/maintenance?equipment_id=${foreign.equipment.id}`,
        200
      )

      expect(foreignRecords).toEqual([])
    }
  })
})

test('dashboard statistics and recent activity are isolated', async ({ page, request, browser }) => {
  await withTwoUsers(page, request, browser, async ({
    pageA, pageB, userA, userB,
    headersA, headersB, dataA, dataB,
  }) => {
    for (const [currentPage, headers, user, own, foreign, available, broken, cost] of [
      [pageA, headersA, userA, dataA, dataB, 1, 0, 125.50],
      [pageB, headersB, userB, dataB, dataA, 0, 1, 875.25],
    ]) {
      const [response] = await Promise.all([
        waitForApiResponse(currentPage, '/dashboard', 'GET'),
        currentPage.goto('/'),
      ])

      expect(response.status()).toBe(200)

      const dashboard = await response.json()

      expect(dashboard.user_email).toBe(user.email)

      expect(dashboard.stats).toMatchObject({
        total_laboratories: 1,
        total_equipment: 1,
        available_equipment: available,
        maintenance_equipment: 0,
        broken_equipment: broken,
        total_maintenance_records: 1,
      })

      expect(Number(
        dashboard.stats.total_maintenance_cost
      )).toBe(cost)

      expect(dashboard.laboratories).toEqual([
        { ...own.lab, equipment_count: 1 },
      ])

      expect(
        dashboard.recent_maintenance.map(item => item.id)
      ).toEqual([own.maintenance.id])

      await expectVisibleOnly(
        currentPage, own.lab.name, foreign.lab.name
      )

      await expectVisibleOnly(
        currentPage,
        own.maintenance.description,
        foreign.maintenance.description
      )

      await expectVisibleOnly(
        currentPage,
        own.equipment.name,
        foreign.equipment.name
      )

      for (const [label, value] of [
        ['Toplam Laboratuvar', 1],
        ['Toplam Ekipman', 1],
        ['Aktif Ekipman', available],
        ['Bakımda', 0],
        ['Arızalı Ekipman', broken],
        ['Bakım Kayıtları', 1],
        ['Toplam Bakım Maliyeti',
          cost.toLocaleString('tr-TR', {
            style: 'currency',
            currency: 'TRY',
          })],
      ]) {
        await expect(
          currentPage.locator('.stat-card').filter({
            has: currentPage.getByText(label, { exact: true }),
          }).locator('.stat-value')
        ).toHaveText(String(value))
      }

      const stats = await apiRequest(
        request, headers, 'GET', '/equipment/stats', 200
      )

      expect(stats).toEqual({
        total: 1,
        available,
        maintenance: 0,
        broken,
      })
    }
  })
})

test('users cannot update or delete another user laboratory', async ({ page, request, browser }) => {
  await withTwoUsers(page, request, browser, async ({
    headersA, headersB, dataA, dataB,
  }) => {
    for (const [headers, foreign] of [
      [headersA, dataB],
      [headersB, dataA],
    ]) {
      const path = `/laboratories/${foreign.lab.id}`

      await expectNotFound(
        request, headers, 'PUT', path,
        'Laboratory not found',
        {
          name: 'Unauthorized laboratory update',
          location: 'Unauthorized location',
        }
      )

      await expectNotFound(
        request, headers, 'DELETE', path,
        'Laboratory not found'
      )
    }

    await expectUnchanged(request, headersA, dataA)
    await expectUnchanged(request, headersB, dataB)
  })
})

test('equipment ownership and cross-user laboratory relationships are protected', async ({ page, request, browser }) => {
  await withTwoUsers(page, request, browser, async ({
    headersA, headersB, dataA, dataB,
  }) => {
    for (const [headers, own, foreign] of [
      [headersA, dataA, dataB],
      [headersB, dataB, dataA],
    ]) {
      await expectNotFound(
        request, headers, 'POST', '/equipment',
        'Laboratory not found',
        {
          name: 'Unauthorized equipment',
          serial_number: `E2E-${randomUUID()}`,
          status: 'available',
          laboratory_id: foreign.lab.id,
        }
      )

      await expectNotFound(
        request, headers, 'PUT',
        `/equipment/${foreign.equipment.id}`,
        'Equipment not found',
        equipmentPayload(foreign.equipment, {
          name: 'Unauthorized equipment update',
          laboratory_id: own.lab.id,
        })
      )

      await expectNotFound(
        request, headers, 'DELETE',
        `/equipment/${foreign.equipment.id}`,
        'Equipment not found'
      )

      await expectNotFound(
        request, headers, 'PUT',
        `/equipment/${own.equipment.id}`,
        'Laboratory not found',
        equipmentPayload(own.equipment, {
          laboratory_id: foreign.lab.id,
        })
      )
    }

    await expectUnchanged(request, headersA, dataA)
    await expectUnchanged(request, headersB, dataB)
  })
})

test('maintenance ownership and cross-user equipment relationships are protected', async ({ page, request, browser }) => {
  await withTwoUsers(page, request, browser, async ({
    headersA, headersB, dataA, dataB,
  }) => {
    for (const [headers, own, foreign] of [
      [headersA, dataA, dataB],
      [headersB, dataB, dataA],
    ]) {
      await expectNotFound(
        request, headers, 'POST', '/maintenance',
        'Equipment not found',
        maintenancePayload(own.maintenance, {
          equipment_id: foreign.equipment.id,
          description: 'Unauthorized maintenance',
        })
      )

      await expectNotFound(
        request, headers, 'PUT',
        `/maintenance/${foreign.maintenance.id}`,
        'Maintenance record not found',
        maintenancePayload(foreign.maintenance, {
          equipment_id: own.equipment.id,
          description: 'Unauthorized maintenance update',
        })
      )

      await expectNotFound(
        request, headers, 'DELETE',
        `/maintenance/${foreign.maintenance.id}`,
        'Maintenance record not found'
      )

      await expectNotFound(
        request, headers, 'PUT',
        `/maintenance/${own.maintenance.id}`,
        'Equipment not found',
        maintenancePayload(own.maintenance, {
          equipment_id: foreign.equipment.id,
        })
      )
    }

    await expectUnchanged(request, headersA, dataA)
    await expectUnchanged(request, headersB, dataB)
  })
})

test('switching accounts in the same browser does not retain previous user data', async ({ page, request, browser }) => {
  await withTwoUsers(page, request, browser, async ({
    pageA, pageB, userA, userB, dataA, dataB,
  }) => {
    const resources = [
      ['/laboratories', dataA.lab, dataB.lab, 'name'],
      ['/equipment', dataA.equipment, dataB.equipment, 'name'],
      ['/maintenance', dataA.maintenance, dataB.maintenance, 'description'],
    ]

    for (const [path, first, second, field] of resources) {
      expect(
        await openResourcePage(pageA, path)
      ).toEqual([first])

      await expectVisibleOnly(
        pageA, first[field], second[field]
      )
    }

    await logout(pageA)
    await login(pageA, userB)

    await expect(
      pageA.getByText(userB.email, { exact: true })
    ).toBeVisible()

    await expect(
      pageA.getByText(userA.email, { exact: true })
    ).toHaveCount(0)

    for (const [path, first, second, field] of resources) {
      expect(
        await openResourcePage(pageA, path)
      ).toEqual([second])

      await expectVisibleOnly(
        pageA, second[field], first[field]
      )

      await pageA.reload()

      await expectVisibleOnly(
        pageA, second[field], first[field]
      )
    }

    await logout(pageA)
    await login(pageA, userA)

    for (const [path, first, second, field] of resources) {
      expect(
        await openResourcePage(pageA, path)
      ).toEqual([first])

      await expectVisibleOnly(
        pageA, first[field], second[field]
      )
    }

    expect(
      await openResourcePage(pageB, '/laboratories')
    ).toEqual([dataB.lab])
  })
})
