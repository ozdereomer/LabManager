import { expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'

export function createCredentials() {
  return {
    email: `e2e-${randomUUID()}@example.com`,
    password: 'Isolated-E2E-Test-Password123!',
  }
}

export function waitForApiResponse(page, path, method) {
  return page.waitForResponse(
    response =>
      new URL(response.url()).pathname === `/api${path}` &&
      response.request().method() === method
  )
}

export async function createUser(request) {
  const credentials = createCredentials()

  let response = await request.post('/api/register', {
    data: credentials,
  })

  if (response.status() === 429) {
    const retryAfter = Number(
      response.headers()['retry-after']
    )

    expect(Number.isInteger(retryAfter)).toBe(true)
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(60)

    await response.dispose()

    await new Promise(resolve =>
      setTimeout(resolve, (retryAfter + 1) * 1000)
    )

    response = await request.post('/api/register', {
      data: credentials,
    })
  }

  expect(response.status()).toBe(201)

  const user = await response.json()

  expect(user.email).toBe(credentials.email)
  expect(user.is_active).toBe(true)

  return {
    ...credentials,
    id: user.id,
  }
}

export async function fillLoginForm(page, credentials) {
  await page.getByLabel('E-posta').fill(credentials.email)
  await page.getByLabel('Şifre').fill(credentials.password)
}

export async function login(page, credentials) {
  await page.goto('/login')

  await fillLoginForm(page, credentials)

  const [response] = await Promise.all([
    waitForApiResponse(page, '/login', 'POST'),
    page.getByRole('button', {
      name: 'Giriş Yap',
      exact: true,
    }).click(),
  ])

  expect(response.status()).toBe(200)

  await expect(page).toHaveURL(
    new URL('/', page.url()).href
  )

  expect(
    await page.evaluate(
      () => Boolean(localStorage.getItem('access_token'))
    )
  ).toBe(true)
}

export async function createAuthenticatedUser(page, request) {
  const user = await createUser(request)

  await login(page, user)

  return user
}

export async function logout(page) {
  await page.goto('/settings')

  await expect(
    page.getByRole('heading', {
      name: 'Hesap Bilgileri',
      exact: true,
    })
  ).toBeVisible()

  await page.getByRole('button', {
    name: 'Çıkış Yap',
    exact: true,
  }).click()

  await expect(page).toHaveURL(/\/login$/)

  expect(
    await page.evaluate(
      () => localStorage.getItem('access_token')
    )
  ).toBeNull()
}
