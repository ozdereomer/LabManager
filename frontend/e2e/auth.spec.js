import { test, expect } from '@playwright/test'

import {
  createUser,
  createAuthenticatedUser,
  fillLoginForm,
  login,
  logout,
  waitForApiResponse,
} from './helpers.js'

test('existing user can log in successfully', async ({ page, request }) => {
  const user = await createUser(request)

  await login(page, user)
  await page.goto('/settings')

  await expect(
    page.getByText(user.email, { exact: true })
  ).toBeVisible()
})

test('incorrect password is rejected', async ({ page, request }) => {
  const user = await createUser(request)

  await page.goto('/login')

  await fillLoginForm(page, {
    ...user,
    password: 'IncorrectPassword123!',
  })

  const [response] = await Promise.all([
    waitForApiResponse(page, '/login', 'POST'),
    page.getByRole('button', {
      name: 'Giriş Yap',
      exact: true,
    }).click(),
  ])

  expect(response.status()).toBe(401)

  await expect(
    page.getByText('Incorrect email or password', { exact: true })
  ).toBeVisible()

  await expect(page).toHaveURL(/\/login$/)

  expect(
    await page.evaluate(() => localStorage.getItem('access_token'))
  ).toBeNull()
})

test('duplicate email registration is rejected', async ({ page, request }) => {
  const user = await createUser(request)

  await page.goto('/login')

  await page.getByRole('button', {
    name: 'Kayıt Ol',
    exact: true,
  }).click()

  await fillLoginForm(page, user)

  const [response] = await Promise.all([
    waitForApiResponse(page, '/register', 'POST'),
    page.getByRole('button', {
      name: 'Kayıt Ol',
      exact: true,
    }).click(),
  ])

  expect(response.status()).toBe(409)

  await expect(
    page.getByText('Email already registered', { exact: true })
  ).toBeVisible()

  await expect(page).toHaveURL(/\/login$/)

  expect(
    await page.evaluate(() => localStorage.getItem('access_token'))
  ).toBeNull()
})

test('authenticated session survives page reload', async ({ page, request }) => {
  const user = await createAuthenticatedUser(page, request)

  await page.goto('/settings')

  await expect(
    page.getByText(user.email, { exact: true })
  ).toBeVisible()

  await page.reload()

  await expect(page).toHaveURL(/\/settings$/)

  await expect(
    page.getByText(user.email, { exact: true })
  ).toBeVisible()
})

test('logout clears session and protects private pages', async ({ page, request }) => {
  await createAuthenticatedUser(page, request)

  await logout(page)

  for (const path of [
    '/',
    '/laboratories',
    '/equipment',
    '/maintenance',
    '/settings',
  ]) {
    await page.goto(path)

    await expect(page).toHaveURL(/\/login$/)

    await expect(
      page.getByRole('heading', { name: 'Hoş Geldiniz' })
    ).toBeVisible()
  }
})

test('invalid token triggers automatic logout', async ({ page, request }) => {
  await createAuthenticatedUser(page, request)

  await page.evaluate(() => {
    localStorage.setItem('access_token', 'invalid-e2e-token')
  })

  const [response] = await Promise.all([
    waitForApiResponse(page, '/users/me', 'GET'),
    page.goto('/settings'),
  ])

  expect(response.status()).toBe(401)

  await expect(page).toHaveURL(/\/login$/)

  expect(
    await page.evaluate(() => localStorage.getItem('access_token'))
  ).toBeNull()
})

test('repeated failed login attempts trigger rate limiting', async ({ page, request }) => {
  const user = await createUser(request)

  await page.goto('/login')

  await fillLoginForm(page, {
    ...user,
    password: 'IncorrectPassword123!',
  })

  const submit = page.getByRole('button', {
    name: 'Giriş Yap',
    exact: true,
  })

  for (let attempt = 0; attempt < 5; attempt++) {
    const [response] = await Promise.all([
      waitForApiResponse(page, '/login', 'POST'),
      submit.click(),
    ])

    expect(response.status()).toBe(401)

    await expect(submit).toBeEnabled()
  }

  const [response] = await Promise.all([
    waitForApiResponse(page, '/login', 'POST'),
    submit.click(),
  ])

  expect(response.status()).toBe(429)

  const retryAfter = Number(
    response.headers()['retry-after']
  )

  expect(retryAfter).toBeGreaterThan(0)
  expect(retryAfter).toBeLessThanOrEqual(60)

  await expect(
    page.getByText(/Çok fazla işlem yaptınız/)
  ).toBeVisible()

  await expect(page).toHaveURL(/\/login$/)

  expect(
    await page.evaluate(() => localStorage.getItem('access_token'))
  ).toBeNull()
})
