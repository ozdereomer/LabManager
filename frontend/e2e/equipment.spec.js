import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'

import {
  createAuthenticatedUser,
  waitForApiResponse,
} from './helpers.js'

const emptyMessage = 'Henüz kayıtlı ekipmanınız bulunmuyor.'

function equipmentRow(page, serial) {
  return page.getByRole('row').filter({
    has: page.getByRole('cell', {
      name: serial,
      exact: true,
    }),
  })
}

async function createLab(page, request, name) {
  const token = await page.evaluate(
    () => localStorage.getItem('access_token')
  )

  expect(Boolean(token)).toBe(true)

  const response = await request.post('/api/laboratories', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: {
      name,
      location: 'E2E Test Konumu',
    },
  })

  expect(response.status()).toBe(201)

  return response.json()
}

async function openCreateForm(page) {
  await page.getByRole('button', {
    name: '+ Ekipman Ekle',
    exact: true,
  }).click()

  await expect(
    page.getByRole('heading', { name: 'Yeni Ekipman' })
  ).toBeVisible()
}

async function fillEquipmentForm(page, data) {
  await page.getByLabel('Ekipman Adı').fill(data.name)
  await page.getByLabel('Seri Numarası').fill(data.serial_number)
  await page.getByLabel('Durum').selectOption(data.status)
  await page.getByLabel('Bağlı Laboratuvar')
    .selectOption(String(data.laboratory_id))
}

async function prepareLaboratory(page, request) {
  const lab = await createLab(page, request, 'Test Laboratuvarı')

  await page.goto('/equipment')

  await expect(page.getByText(emptyMessage)).toBeVisible()

  return lab
}

async function createEquipment(page, lab, overrides = {}) {
  const data = {
    name: '3D Yazıcı',
    serial_number: `E2E-${randomUUID()}`,
    status: 'available',
    laboratory_id: lab.id,
    ...overrides,
  }

  await openCreateForm(page)
  await fillEquipmentForm(page, data)

  const [response] = await Promise.all([
    waitForApiResponse(page, '/equipment', 'POST'),
    page.getByRole('button', {
      name: 'Kaydet',
      exact: true,
    }).click(),
  ])

  expect(response.status()).toBe(201)

  const equipment = await response.json()

  expect(equipment).toMatchObject({
    ...data,
    name: data.name.trim(),
    serial_number: data.serial_number.trim(),
  })

  await expect(
    equipmentRow(page, equipment.serial_number)
  ).toBeVisible()

  await expect(
    page.getByLabel('Ekipman Adı')
  ).toHaveCount(0)

  return equipment
}

test.beforeEach(async ({ page, request }) => {
  await createAuthenticatedUser(page, request)
})

test('equipment creation is disabled without laboratories', async ({ page }) => {
  await page.goto('/equipment')

  await expect(
    page.getByText('Önce bir laboratuvar oluşturmalısınız.')
  ).toBeVisible()

  await expect(
    page.getByRole('button', {
      name: '+ Ekipman Ekle',
      exact: true,
    })
  ).toBeDisabled()
})

test('equipment can be created and survives reload', async ({ page, request }) => {
  const lab = await prepareLaboratory(page, request)

  const item = await createEquipment(page, lab, {
    name: '  3D Yazıcı  ',
    serial_number: `  E2E-${randomUUID()}  `,
  })

  await page.reload()

  const row = equipmentRow(page, item.serial_number)

  await expect(row.getByText('3D Yazıcı', {
    exact: true,
  })).toBeVisible()

  await expect(row.getByText('Kullanılabilir', {
    exact: true,
  })).toBeVisible()

  await expect(row.getByText(lab.name, {
    exact: true,
  })).toBeVisible()
})

test('equipment can be edited and moved to another laboratory', async ({ page, request }) => {
  const lab = await createLab(page, request, 'İlk Laboratuvar')
  const target = await createLab(page, request, 'İkinci Laboratuvar')

  await page.goto('/equipment')

  const item = await createEquipment(page, lab)

  await equipmentRow(page, item.serial_number)
    .getByRole('button', { name: 'Düzenle' })
    .click()

  await expect(
    page.getByLabel('Ekipman Adı')
  ).toHaveValue(item.name)

  await expect(
    page.getByLabel('Seri Numarası')
  ).toHaveValue(item.serial_number)

  await expect(
    page.getByLabel('Durum')
  ).toHaveValue('available')

  await expect(
    page.getByLabel('Bağlı Laboratuvar')
  ).toHaveValue(String(lab.id))

  const updatedData = {
    name: 'Güncellenmiş Yazıcı',
    serial_number: item.serial_number,
    status: 'maintenance',
    laboratory_id: target.id,
  }

  await fillEquipmentForm(page, updatedData)

  const [response] = await Promise.all([
    waitForApiResponse(
      page,
      '/equipment/' + item.id,
      'PUT'
    ),
    page.getByRole('button', {
      name: 'Değişiklikleri Kaydet',
    }).click(),
  ])

  expect(response.status()).toBe(200)

  expect(await response.json()).toMatchObject({
    id: item.id,
    ...updatedData,
  })

  await expect(
    page.getByLabel('Ekipman Adı')
  ).toHaveCount(0)

  await page.reload()

  const row = equipmentRow(page, item.serial_number)

  await expect(row.getByText('Güncellenmiş Yazıcı'))
    .toBeVisible()

  await expect(row.getByText('Bakımda')).toBeVisible()

  await expect(row.getByText(target.name, {
    exact: true,
  })).toBeVisible()
})

test('duplicate equipment serial number is rejected', async ({ page, request }) => {
  const lab = await prepareLaboratory(page, request)
  const item = await createEquipment(page, lab)

  await openCreateForm(page)

  await fillEquipmentForm(page, {
    name: 'Tekrarlanan Ekipman',
    serial_number: item.serial_number,
    status: 'broken',
    laboratory_id: lab.id,
  })

  const [response] = await Promise.all([
    waitForApiResponse(page, '/equipment', 'POST'),
    page.getByRole('button', {
      name: 'Kaydet',
      exact: true,
    }).click(),
  ])

  expect(response.status()).toBe(409)

  await expect(
    page.getByText('This serial number already exists')
  ).toBeVisible()

  await expect(
    page.getByLabel('Seri Numarası')
  ).toHaveValue(item.serial_number)

  await expect(
    equipmentRow(page, item.serial_number)
  ).toHaveCount(1)

  await page.reload()

  await expect(
    equipmentRow(page, item.serial_number)
  ).toHaveCount(1)

  await expect(
    page.getByRole('cell', {
      name: 'Tekrarlanan Ekipman',
      exact: true,
    })
  ).toHaveCount(0)
})

test('cancelling equipment deletion preserves the record', async ({ page, request }) => {
  const lab = await prepareLaboratory(page, request)
  const item = await createEquipment(page, lab)

  let message = ''

  page.once('dialog', async dialog => {
    message = dialog.message()
    await dialog.dismiss()
  })

  await equipmentRow(page, item.serial_number)
    .getByRole('button', { name: 'Sil', exact: true })
    .click()

  expect(message).toContain(item.name)

  await page.reload()

  await expect(
    equipmentRow(page, item.serial_number)
  ).toBeVisible()
})

test('confirmed equipment deletion removes the record', async ({ page, request }) => {
  const lab = await prepareLaboratory(page, request)

  const item = await createEquipment(page, lab, {
    status: 'broken',
  })

  const row = equipmentRow(page, item.serial_number)

  await expect(row.getByText('Arızalı')).toBeVisible()

  page.once('dialog', dialog => dialog.accept())

  const [response] = await Promise.all([
    waitForApiResponse(
      page,
      '/equipment/' + item.id,
      'DELETE'
    ),
    row.getByRole('button', {
      name: 'Sil',
      exact: true,
    }).click(),
  ])

  expect(response.status()).toBe(200)

  await expect(row).toHaveCount(0)
  await expect(page.getByText(emptyMessage)).toBeVisible()

  await page.reload()

  await expect(page.getByText(emptyMessage)).toBeVisible()
})

test('invalid equipment form is rejected and cancel resets fields', async ({ page, request }) => {
  const lab = await prepareLaboratory(page, request)

  await openCreateForm(page)

  await fillEquipmentForm(page, {
    name: '   ',
    serial_number: `E2E-${randomUUID()}`,
    status: 'broken',
    laboratory_id: lab.id,
  })

  await page.getByRole('button', {
    name: 'Kaydet',
    exact: true,
  }).click()

  await expect(
    page.getByText('Lütfen tüm alanları doldurun.')
  ).toBeVisible()

  await page.getByRole('button', {
    name: 'İptal',
    exact: true,
  }).click()

  await openCreateForm(page)

  await expect(
    page.getByLabel('Ekipman Adı')
  ).toHaveValue('')

  await expect(
    page.getByLabel('Seri Numarası')
  ).toHaveValue('')

  await expect(
    page.getByLabel('Durum')
  ).toHaveValue('available')

  await expect(
    page.getByLabel('Bağlı Laboratuvar')
  ).toHaveValue('')

  await page.reload()

  await expect(page.getByText(emptyMessage)).toBeVisible()
})

test('laboratory containing equipment cannot be deleted', async ({ page, request }) => {
  const lab = await prepareLaboratory(page, request)
  const item = await createEquipment(page, lab)

  await page.goto('/laboratories')

  const row = page.getByRole('row').filter({
    has: page.getByRole('cell', {
      name: lab.name,
      exact: true,
    }),
  })

  page.once('dialog', dialog => dialog.accept())

  const [response] = await Promise.all([
    waitForApiResponse(
      page,
      '/laboratories/' + lab.id,
      'DELETE'
    ),
    row.getByRole('button', {
      name: 'Sil',
      exact: true,
    }).click(),
  ])

  expect(response.status()).toBe(409)

  const error = await response.json()

  expect(error.detail).toBe(
    'Cannot delete laboratory with existing equipment'
  )

  await expect(
    page.getByText(error.detail, { exact: true })
  ).toBeVisible()

  await expect(row).toBeVisible()

  await page.reload()
  await expect(row).toBeVisible()

  await page.goto('/equipment')

  await expect(
    equipmentRow(page, item.serial_number)
  ).toBeVisible()
})
