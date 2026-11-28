import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'

test('API health is available through Vite proxy', async ({ request }) => {
  const response = await request.get('/api/health')

  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({
    status: 'healthy',
  })
})

test('login page renders correctly', async ({ page }) => {
  await page.goto('/login')

  await expect(
    page.getByRole('heading', { name: 'Hoş Geldiniz' })
  ).toBeVisible()

  await expect(page.getByLabel('E-posta')).toBeVisible()
  await expect(page.getByLabel('Şifre')).toBeVisible()

  await expect(
    page.getByRole('button', { name: 'Giriş Yap', exact: true })
  ).toBeVisible()
})

test('unauthenticated users cannot access protected pages', async ({ page }) => {
  await page.goto('/laboratories')

  await expect(page).toHaveURL(/\/login$/)

  await expect(
    page.getByRole('heading', { name: 'Hoş Geldiniz' })
  ).toBeVisible()

  expect(
    await page.evaluate(() => localStorage.getItem('access_token'))
  ).toBeNull()
})

test('registration creates a real authenticated session', async ({ page }) => {
  const email = `e2e-${randomUUID()}@example.com`
  const password = 'Isolated-E2E-Test-Password123!'

  await page.goto('/login')

  await page.getByRole('button', {
    name: 'Kayıt Ol',
    exact: true,
  }).click()

  await expect(
    page.getByRole('heading', { name: 'Hesap Oluştur' })
  ).toBeVisible()

  await page.getByLabel('E-posta').fill(email)
  await page.getByLabel('Şifre').fill(password)

  const registrationResponse = page.waitForResponse(
    response =>
      new URL(response.url()).pathname === '/api/register' &&
      response.request().method() === 'POST'
  )

  const loginResponse = page.waitForResponse(
    response =>
      new URL(response.url()).pathname === '/api/login' &&
      response.request().method() === 'POST'
  )

  await page.getByRole('button', {
    name: 'Kayıt Ol',
    exact: true,
  }).click()

  expect((await registrationResponse).status()).toBe(201)
  expect((await loginResponse).status()).toBe(200)

  await expect(page).toHaveURL(
    new URL('/', page.url()).href
  )

  const profile = await page.evaluate(async () => {
    const token = localStorage.getItem('access_token')

    if (!token) {
      throw new Error('Access token is missing')
    }

    const response = await fetch('/api/users/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    return {
      status: response.status,
      body: await response.json(),
    }
  })

  expect(profile.status).toBe(200)
  expect(profile.body.email).toBe(email)
})
