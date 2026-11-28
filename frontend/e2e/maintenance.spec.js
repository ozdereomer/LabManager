import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'

import {
  createAuthenticatedUser,
  waitForApiResponse,
} from './helpers.js'

const emptyMessage =
  'Henüz kayıtlı bakım işleminiz bulunmuyor.'

function recordRow(page, description) {
  return page.getByRole('row').filter({
    has: page.getByRole('cell', {
      name: description,
      exact: true,
    }),
  })
}

async function createEquipment(page, request) {
  const token = await page.evaluate(
    () => localStorage.getItem('access_token')
  )

  expect(Boolean(token)).toBe(true)

  const headers = {
    Authorization: `Bearer ${token}`,
  }

  const labResponse = await request.post('/api/laboratories', {
    headers,
    data: {
      name: 'Bakım Test Laboratuvarı',
      location: 'E2E Test Konumu',
    },
  })

  expect(labResponse.status()).toBe(201)

  const lab = await labResponse.json()

  const response = await request.post('/api/equipment', {
    headers,
    data: {
      name: '3D Yazıcı',
      serial_number: `E2E-${randomUUID()}`,
      status: 'available',
      laboratory_id: lab.id,
    },
  })

  expect(response.status()).toBe(201)

  return response.json()
}

async function prepareEquipment(page, request) {
  const item = await createEquipment(page, request)

  await page.goto('/maintenance')

  await expect(page.getByText(emptyMessage)).toBeVisible()

  return item
}

async function openCreateForm(page) {
  await page.getByRole('button', {
    name: '+ Bakım Kaydı Ekle',
    exact: true,
  }).click()

  await expect(
    page.getByRole('heading', {
      name: 'Yeni Bakım Kaydı',
      exact: true,
    })
  ).toBeVisible()
}

async function fillForm(page, data) {
  await page.getByLabel('Ekipman', { exact: true })
    .selectOption(String(data.equipment_id))

  await page.getByLabel('Bakım Tarihi')
    .fill(data.maintenance_date)

  await page.getByLabel('Açıklama')
    .fill(data.description)

  await page.getByLabel('Teknisyen')
    .fill(data.technician ?? '')

  await page.getByLabel('Maliyet')
    .fill(data.cost === null ? '' : String(data.cost))
}

async function createRecord(page, item, overrides = {}) {
  const data = {
    equipment_id: item.id,
    maintenance_date: '2026-11-26',
    description: 'Periyodik bakım',
    technician: 'Test Teknisyen',
    cost: 250.50,
    ...overrides,
  }

  await openCreateForm(page)
  await fillForm(page, data)

  const [response] = await Promise.all([
    waitForApiResponse(page, '/maintenance', 'POST'),
    page.getByRole('button', {
      name: 'Kaydet',
      exact: true,
    }).click(),
  ])

  expect(response.status()).toBe(201)

  const record = await response.json()

  expect(record).toMatchObject({
    equipment_id: data.equipment_id,
    maintenance_date: data.maintenance_date,
    description: data.description.trim(),
    technician: data.technician?.trim() || null,
  })

  if (data.cost === null) {
    expect(record.cost).toBeNull()
  } else {
    expect(record.cost).not.toBeNull()
    expect(Number(record.cost)).toBe(data.cost)
  }

  await expect(
    recordRow(page, record.description)
  ).toBeVisible()

  await expect(
    page.getByLabel('Açıklama')
  ).toHaveCount(0)

  return record
}

test.beforeEach(async ({ page, request }) => {
  await createAuthenticatedUser(page, request)
})

test('maintenance creation is disabled without equipment', async ({ page }) => {
  await page.goto('/maintenance')

  await expect(
    page.getByText('Önce bir ekipman oluşturmalısınız.')
  ).toBeVisible()

  await expect(
    page.getByRole('button', {
      name: '+ Bakım Kaydı Ekle',
      exact: true,
    })
  ).toBeDisabled()
})

test('new equipment has an empty maintenance list', async ({ page, request }) => {
  await prepareEquipment(page, request)

  await expect(page.getByText(emptyMessage)).toBeVisible()

  await expect(
    page.getByRole('button', {
      name: '+ Bakım Kaydı Ekle',
      exact: true,
    })
  ).toBeEnabled()
})

test('maintenance record can be created and survives reload', async ({ page, request }) => {
  const item = await prepareEquipment(page, request)

  const record = await createRecord(page, item, {
    description: '  Periyodik bakım  ',
    technician: '  Test Teknisyen  ',
  })

  await page.reload()

  const row = recordRow(page, record.description)

  for (const value of [
    item.name,
    '2026-11-26',
    'Test Teknisyen',
    '250.50 TL',
  ]) {
    await expect(
      row.getByRole('cell', {
        name: value,
        exact: true,
      })
    ).toBeVisible()
  }
})

test('optional maintenance fields are stored as null', async ({ page, request }) => {
  const item = await prepareEquipment(page, request)

  const record = await createRecord(page, item, {
    technician: '   ',
    cost: null,
  })

  await page.reload()

  await expect(
    recordRow(page, record.description)
      .getByRole('cell', { name: '-', exact: true })
  ).toHaveCount(2)
})

test('zero maintenance cost is accepted', async ({ page, request }) => {
  const item = await prepareEquipment(page, request)

  const record = await createRecord(page, item, {
    cost: 0,
  })

  await page.reload()

  await expect(
    recordRow(page, record.description)
      .getByRole('cell', {
        name: '0.00 TL',
        exact: true,
      })
  ).toBeVisible()
})

test('maintenance record can be edited and changes persist', async ({ page, request }) => {
  const item = await prepareEquipment(page, request)
  const record = await createRecord(page, item)

  await recordRow(page, record.description)
    .getByRole('button', { name: 'Düzenle', exact: true })
    .click()

  await expect(
    page.getByRole('heading', {
      name: 'Bakım Kaydını Düzenle',
      exact: true,
    })
  ).toBeVisible()

  await expect(
    page.getByLabel('Ekipman', { exact: true })
  ).toHaveValue(String(item.id))

  await expect(
    page.getByLabel('Bakım Tarihi')
  ).toHaveValue(record.maintenance_date)

  await expect(
    page.getByLabel('Açıklama')
  ).toHaveValue(record.description)

  await expect(
    page.getByLabel('Teknisyen')
  ).toHaveValue(record.technician)

  expect(Number(
    await page.getByLabel('Maliyet').inputValue()
  )).toBe(250.50)

  const updatedData = {
    equipment_id: item.id,
    maintenance_date: '2026-11-27',
    description: 'Güncellenmiş bakım',
    technician: 'Yeni Teknisyen',
    cost: 400.75,
  }

  await fillForm(page, updatedData)

  const [response] = await Promise.all([
    waitForApiResponse(
      page, '/maintenance/' + record.id, 'PUT'
    ),
    page.getByRole('button', {
      name: 'Değişiklikleri Kaydet',
      exact: true,
    }).click(),
  ])

  expect(response.status()).toBe(200)

  const updated = await response.json()

  expect(updated).toMatchObject({
    id: record.id,
    equipment_id: item.id,
    maintenance_date: updatedData.maintenance_date,
    description: updatedData.description,
    technician: updatedData.technician,
  })

  expect(Number(updated.cost)).toBe(400.75)

  await expect(
    page.getByLabel('Açıklama')
  ).toHaveCount(0)

  await page.reload()

  const row = recordRow(page, updatedData.description)

  for (const value of [
    '2026-11-27',
    'Yeni Teknisyen',
    '400.75 TL',
  ]) {
    await expect(
      row.getByRole('cell', {
        name: value,
        exact: true,
      })
    ).toBeVisible()
  }

  await expect(
    recordRow(page, record.description)
  ).toHaveCount(0)
})

test('cancelling maintenance deletion preserves the record', async ({ page, request }) => {
  const item = await prepareEquipment(page, request)
  const record = await createRecord(page, item)

  let message = ''

  page.once('dialog', async dialog => {
    message = dialog.message()
    await dialog.dismiss()
  })

  await recordRow(page, record.description)
    .getByRole('button', { name: 'Sil', exact: true })
    .click()

  expect(message).toBe(
    'Bu bakım kaydını silmek istediğinize emin misiniz?'
  )

  await page.reload()

  await expect(
    recordRow(page, record.description)
  ).toBeVisible()
})

test('confirmed maintenance deletion removes the record', async ({ page, request }) => {
  const item = await prepareEquipment(page, request)
  const record = await createRecord(page, item)

  page.once('dialog', dialog => dialog.accept())

  const [response] = await Promise.all([
    waitForApiResponse(
      page, '/maintenance/' + record.id, 'DELETE'
    ),
    recordRow(page, record.description)
      .getByRole('button', { name: 'Sil', exact: true })
      .click(),
  ])

  expect(response.status()).toBe(200)

  expect(await response.json()).toMatchObject({
    maintenance_id: record.id,
    message: 'Maintenance record deleted successfully',
  })

  await expect(
    recordRow(page, record.description)
  ).toHaveCount(0)

  await expect(page.getByText(emptyMessage)).toBeVisible()

  await page.reload()

  await expect(page.getByText(emptyMessage)).toBeVisible()
})

test('invalid maintenance form is rejected and cancel resets fields', async ({ page, request }) => {
  const item = await prepareEquipment(page, request)

  await openCreateForm(page)

  await fillForm(page, {
    equipment_id: item.id,
    maintenance_date: '2026-11-26',
    description: '   ',
    technician: 'Test Teknisyen',
    cost: 250,
  })

  const submit = page.getByRole('button', {
    name: 'Kaydet',
    exact: true,
  })

  await submit.click()

  await expect(
    page.getByText('Lütfen zorunlu alanları doldurun.')
  ).toBeVisible()

  await page.getByLabel('Açıklama').fill('Test bakım')
  await page.getByLabel('Maliyet').fill('-50')

  await submit.click()

  expect(await page.getByLabel('Maliyet').evaluate(
    element => element.validity.rangeUnderflow
  )).toBe(true)

  await page.getByLabel('Maliyet').fill('100')
  await page.getByLabel('Bakım Tarihi').fill('')

  await submit.click()

  expect(await page.getByLabel('Bakım Tarihi').evaluate(
    element => element.validity.valueMissing
  )).toBe(true)

  await page.getByRole('button', {
    name: 'İptal',
    exact: true,
  }).click()

  await openCreateForm(page)

  for (const label of [
    'Ekipman',
    'Bakım Tarihi',
    'Açıklama',
    'Teknisyen',
    'Maliyet',
  ]) {
    await expect(
      page.getByLabel(label, { exact: true })
    ).toHaveValue('')
  }

  await page.reload()

  await expect(page.getByText(emptyMessage)).toBeVisible()
})

test('equipment containing maintenance records cannot be deleted', async ({ page, request }) => {
  const item = await prepareEquipment(page, request)
  const record = await createRecord(page, item)

  await page.goto('/equipment')

  const row = page.getByRole('row').filter({
    has: page.getByRole('cell', {
      name: item.serial_number,
      exact: true,
    }),
  })

  page.once('dialog', dialog => dialog.accept())

  const [response] = await Promise.all([
    waitForApiResponse(
      page, '/equipment/' + item.id, 'DELETE'
    ),
    row.getByRole('button', {
      name: 'Sil',
      exact: true,
    }).click(),
  ])

  expect(response.status()).toBe(409)

  const error = await response.json()

  expect(error.detail).toBe(
    'Cannot delete equipment with maintenance records'
  )

  await expect(
    page.getByText(error.detail, { exact: true })
  ).toBeVisible()

  await expect(row).toBeVisible()

  await page.reload()
  await expect(row).toBeVisible()

  await page.goto('/maintenance')

  await expect(
    recordRow(page, record.description)
  ).toBeVisible()
})
