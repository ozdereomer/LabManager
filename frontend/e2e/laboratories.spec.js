import { test, expect } from '@playwright/test'

import {
  createAuthenticatedUser,
  waitForApiResponse,
} from './helpers.js'

const emptyMessage = 'Henüz kayıtlı laboratuvarınız bulunmuyor.'

function labRow(page, name) {
  return page.getByRole('row').filter({
    has: page.getByRole('cell', { name, exact: true }),
  })
}

async function openCreateForm(page) {
  await page.getByRole('button', {
    name: '+ Laboratuvar Ekle',
    exact: true,
  }).click()

  await expect(
    page.getByRole('heading', { name: 'Yeni Laboratuvar' })
  ).toBeVisible()
}

async function createLaboratory(page, name, location = '') {
  await openCreateForm(page)

  await page.getByLabel('Laboratuvar Adı').fill(name)
  await page.getByLabel('Konum').fill(location)

  const [response] = await Promise.all([
    waitForApiResponse(page, '/laboratories', 'POST'),
    page.getByRole('button', {
      name: 'Kaydet',
      exact: true,
    }).click(),
  ])

  expect(response.status()).toBe(201)

  const laboratory = await response.json()

  expect(laboratory.name).toBe(name.trim())
  expect(laboratory.location).toBe(location.trim() || null)

  await expect(labRow(page, name.trim())).toBeVisible()

  await expect(
    page.getByLabel('Laboratuvar Adı')
  ).toHaveCount(0)

  return laboratory
}

test.beforeEach(async ({ page, request }) => {
  await createAuthenticatedUser(page, request)

  await page.goto('/laboratories')

  await expect(
    page.getByRole('heading', {
      name: 'Laboratuvarlar',
      exact: true,
    })
  ).toBeVisible()

  await expect(page.getByText(emptyMessage)).toBeVisible()
})

test('new user sees an empty laboratory list', async ({ page }) => {
  await expect(page.getByText(emptyMessage)).toBeVisible()
  await expect(page.getByRole('table')).toHaveCount(0)
})

test('laboratory can be created and survives reload', async ({ page }) => {
  const name = 'Yazılım Laboratuvarı'
  const location = 'A Blok, 2. Kat'

  const laboratory = await createLaboratory(
    page,
    name,
    location
  )

  await expect(
    labRow(page, name).getByRole('cell', {
      name: location,
      exact: true,
    })
  ).toBeVisible()

  const [response] = await Promise.all([
    waitForApiResponse(page, '/laboratories', 'GET'),
    page.reload(),
  ])

  expect(response.status()).toBe(200)

  const laboratories = await response.json()

  expect(laboratories).toEqual([laboratory])

  await expect(labRow(page, name)).toBeVisible()
})

test('laboratory name is trimmed and location is optional', async ({ page }) => {
  await createLaboratory(
    page,
    '  Elektronik Laboratuvarı  '
  )

  await expect(
    labRow(page, 'Elektronik Laboratuvarı')
      .getByRole('cell', {
        name: 'Belirtilmemiş',
        exact: true,
      })
  ).toBeVisible()
})

test('laboratory can be edited and changes persist', async ({ page }) => {
  const laboratory = await createLaboratory(
    page,
    'Eski Laboratuvar',
    'A Blok'
  )

  await labRow(page, laboratory.name)
    .getByRole('button', { name: 'Düzenle' })
    .click()

  await expect(
    page.getByRole('heading', {
      name: 'Laboratuvarı Düzenle',
    })
  ).toBeVisible()

  await expect(
    page.getByLabel('Laboratuvar Adı')
  ).toHaveValue('Eski Laboratuvar')

  await expect(
    page.getByLabel('Konum')
  ).toHaveValue('A Blok')

  await page.getByLabel('Laboratuvar Adı')
    .fill('Güncellenmiş Laboratuvar')

  await page.getByLabel('Konum').fill('B Blok')

  const [response] = await Promise.all([
    waitForApiResponse(
      page,
      '/laboratories/' + laboratory.id,
      'PUT'
    ),
    page.getByRole('button', {
      name: 'Değişiklikleri Kaydet',
    }).click(),
  ])

  expect(response.status()).toBe(200)

  const updated = await response.json()

  expect(updated.id).toBe(laboratory.id)
  expect(updated.name).toBe('Güncellenmiş Laboratuvar')
  expect(updated.location).toBe('B Blok')

  await expect(
    labRow(page, 'Eski Laboratuvar')
  ).toHaveCount(0)

  await page.reload()

  await expect(
    labRow(page, 'Güncellenmiş Laboratuvar')
      .getByRole('cell', { name: 'B Blok', exact: true })
  ).toBeVisible()
})

test('cancelling laboratory deletion preserves the record', async ({ page }) => {
  const laboratory = await createLaboratory(
    page,
    'Korunan Laboratuvar'
  )

  let dialogMessage = ''

  page.once('dialog', async dialog => {
    dialogMessage = dialog.message()
    await dialog.dismiss()
  })

  await labRow(page, laboratory.name)
    .getByRole('button', { name: 'Sil', exact: true })
    .click()

  expect(dialogMessage).toContain(laboratory.name)

  await expect(
    labRow(page, laboratory.name)
  ).toBeVisible()

  await page.reload()

  await expect(
    labRow(page, laboratory.name)
  ).toBeVisible()
})

test('confirmed laboratory deletion removes the record', async ({ page }) => {
  const laboratory = await createLaboratory(
    page,
    'Silinecek Laboratuvar'
  )

  page.once('dialog', dialog => dialog.accept())

  const [response] = await Promise.all([
    waitForApiResponse(
      page,
      '/laboratories/' + laboratory.id,
      'DELETE'
    ),
    labRow(page, laboratory.name)
      .getByRole('button', {
        name: 'Sil',
        exact: true,
      }).click(),
  ])

  expect(response.status()).toBe(200)

  await expect(
    labRow(page, laboratory.name)
  ).toHaveCount(0)

  await expect(page.getByText(emptyMessage)).toBeVisible()

  await page.reload()

  await expect(page.getByText(emptyMessage)).toBeVisible()
})

test('invalid laboratory name is rejected and cancel resets form', async ({ page }) => {
  await openCreateForm(page)

  await page.getByLabel('Laboratuvar Adı').fill('   ')
  await page.getByLabel('Konum').fill('Geçici Konum')

  await page.getByRole('button', {
    name: 'Kaydet',
    exact: true,
  }).click()

  await expect(
    page.getByText('Laboratuvar adı zorunludur.')
  ).toBeVisible()

  await page.getByRole('button', {
    name: 'İptal',
    exact: true,
  }).click()

  await expect(
    page.getByLabel('Laboratuvar Adı')
  ).toHaveCount(0)

  await openCreateForm(page)

  await expect(
    page.getByLabel('Laboratuvar Adı')
  ).toHaveValue('')

  await expect(
    page.getByLabel('Konum')
  ).toHaveValue('')

  await page.reload()

  await expect(page.getByText(emptyMessage)).toBeVisible()
})
