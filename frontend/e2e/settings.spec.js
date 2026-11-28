import { test, expect } from '@playwright/test'

import {
  createCredentials,
  createUser,
  createAuthenticatedUser,
  fillLoginForm,
  login,
  waitForApiResponse,
} from './helpers.js'

const newPassword = 'Updated-E2E-Password456!'
const wrongPassword = 'Incorrect-E2E-Password789!'

async function openSettings(page) {
  const [response] = await Promise.all([
    waitForApiResponse(page, '/users/me', 'GET'),
    page.goto('/settings'),
  ])

  expect(response.status()).toBe(200)

  await expect(
    page.getByRole('heading', {
      name: 'Hesap Bilgileri',
      exact: true,
    })
  ).toBeVisible()

  return response.json()
}

async function getToken(page) {
  const token = await page.evaluate(
    () => localStorage.getItem('access_token')
  )

  expect(Boolean(token)).toBe(true)

  return token
}

async function verifyToken(request, token, status) {
  const response = await request.get('/api/users/me', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  expect(response.status()).toBe(status)

  const data = await response.json()

  if (status === 401) {
    expect(data.detail).toBe(
      'Could not validate credentials'
    )
  }

  return data
}

function emailPanel(page) {
  return page.locator('section.settings-panel').filter({
    has: page.getByRole('heading', {
      name: 'E-posta Değiştir',
      exact: true,
    }),
  })
}

function passwordPanel(page) {
  return page.locator('section.settings-panel').filter({
    has: page.getByRole('heading', {
      name: 'Şifre Değiştir',
      exact: true,
    }),
  })
}

async function fillEmailForm(page, email, password) {
  const panel = emailPanel(page)

  await panel.getByLabel(
    'Yeni e-posta adresi'
  ).fill(email)

  await panel.getByLabel(
    'Mevcut şifre'
  ).fill(password)
}

async function fillPasswordForm(
  page, current, password, confirmation = password
) {
  const panel = passwordPanel(page)

  await panel.getByLabel(
    'Mevcut şifre'
  ).fill(current)

  await panel.getByLabel(
    'Yeni şifre', { exact: true }
  ).fill(password)

  await panel.getByLabel(
    'Yeni şifre tekrar'
  ).fill(confirmation)
}

function emailSubmit(page) {
  return emailPanel(page).getByRole('button', {
    name: 'E-postayı Güncelle',
    exact: true,
  })
}

function passwordSubmit(page) {
  return passwordPanel(page).getByRole('button', {
    name: 'Şifreyi Güncelle',
    exact: true,
  })
}

async function expectLoggedOut(page) {
  await expect(page).toHaveURL(/\/login$/)

  expect(
    await page.evaluate(
      () => localStorage.getItem('access_token')
    )
  ).toBeNull()
}

async function expectRejectedLogin(page, credentials) {
  await page.goto('/login')

  await fillLoginForm(page, credentials)

  const [response] = await Promise.all([
    waitForApiResponse(page, '/login', 'POST'),
    page.getByRole('button', {
      name: 'Giriş Yap',
      exact: true,
    }).click(),
  ])

  expect(response.status()).toBe(401)

  await expect(
    page.getByText(
      'Incorrect email or password',
      { exact: true }
    )
  ).toBeVisible()

  await expectLoggedOut(page)
}

async function expectActiveSession(page, request, token) {
  await expect(page).toHaveURL(/\/settings$/)

  expect(
    await page.evaluate(
      () => Boolean(localStorage.getItem('access_token'))
    )
  ).toBe(true)

  await verifyToken(request, token, 200)
}

async function submitSuccessfulUpdate(
  page, path, button, message
) {
  const dialogPromise = page.waitForEvent('dialog')
    .then(async dialog => {
      const result = {
        type: dialog.type(),
        message: dialog.message(),
      }

      await dialog.accept()

      return result
    })

  const [response, dialog] = await Promise.all([
    waitForApiResponse(page, path, 'PUT'),
    dialogPromise,
    button.click(),
  ])

  expect(response.status()).toBe(200)

  expect(dialog).toEqual({
    type: 'alert',
    message,
  })

  await expectLoggedOut(page)

  return response.json()
}

async function expectUpdateError(
  page, path, button, status, detail, message
) {
  const [response] = await Promise.all([
    waitForApiResponse(page, path, 'PUT'),
    button.click(),
  ])

  expect(response.status()).toBe(status)

  expect(await response.json()).toMatchObject({
    detail,
  })

  await expect(
    page.getByText(message, { exact: true })
  ).toBeVisible()

  await expect(button).toBeEnabled()
}

test('settings displays real user profile information', async ({ page, request }) => {
  const user = await createAuthenticatedUser(page, request)

  const profile = await openSettings(page)

  expect(profile).toMatchObject({
    id: user.id,
    email: user.email,
    is_active: true,
  })

  expect(Number.isNaN(
    Date.parse(profile.created_at)
  )).toBe(false)

  const panel = page.locator('section.settings-panel')
    .filter({
      has: page.getByRole('heading', {
        name: 'Hesap Bilgileri',
        exact: true,
      }),
    })

  const expectedDate = await page.evaluate(
    date => new Date(date).toLocaleDateString('tr-TR'),
    profile.created_at
  )

  for (const value of [
    '#' + user.id,
    user.email,
    'Aktif',
    expectedDate,
  ]) {
    await expect(
      panel.getByText(value, { exact: true })
    ).toBeVisible()
  }
})

test('email update invalidates old sessions and allows login with new email', async ({ page, request, browser }) => {
  const user = await createAuthenticatedUser(page, request)

  await openSettings(page)

  const oldToken = await getToken(page)
  const updatedEmail = createCredentials().email

  const secondContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  })

  try {
    const secondPage = await secondContext.newPage()

    await login(secondPage, user)

    const secondToken = await getToken(secondPage)

    await verifyToken(request, oldToken, 200)
    await verifyToken(request, secondToken, 200)

    await fillEmailForm(
      page, updatedEmail, user.password
    )

    const result = await submitSuccessfulUpdate(
      page,
      '/users/me/email',
      emailSubmit(page),
      'E-posta adresiniz güncellendi. Lütfen tekrar giriş yapın.'
    )

    expect(result.message).toBe(
      'Email updated successfully. Please log in again.'
    )

    await verifyToken(request, oldToken, 401)
    await verifyToken(request, secondToken, 401)

    const [response] = await Promise.all([
      waitForApiResponse(secondPage, '/users/me', 'GET'),
      secondPage.goto('/settings'),
    ])

    expect(response.status()).toBe(401)

    await expectLoggedOut(secondPage)

    await expectRejectedLogin(page, user)

    await login(page, {
      ...user,
      email: updatedEmail,
    })

    const profile = await openSettings(page)

    expect(profile.id).toBe(user.id)
    expect(profile.email).toBe(updatedEmail)

    await expect(
      page.getByText(updatedEmail, { exact: true })
    ).toBeVisible()

    await verifyToken(
      request, await getToken(page), 200
    )

    await verifyToken(request, oldToken, 401)
  } finally {
    await secondContext.close()
  }
})

test('email update rejects incorrect current password', async ({ page, request }) => {
  const user = await createAuthenticatedUser(page, request)

  await openSettings(page)

  const token = await getToken(page)

  await fillEmailForm(
    page, createCredentials().email, wrongPassword
  )

  await expectUpdateError(
    page,
    '/users/me/email',
    emailSubmit(page),
    400,
    'Incorrect current password',
    'Mevcut şifreniz yanlış.'
  )

  await expectActiveSession(page, request, token)

  const profile = await openSettings(page)

  expect(profile.email).toBe(user.email)
})

test('email update rejects an email belonging to another user', async ({ page, request }) => {
  const user = await createAuthenticatedUser(page, request)
  const other = await createUser(request)

  await openSettings(page)

  const token = await getToken(page)

  await fillEmailForm(
    page, other.email, user.password
  )

  await expectUpdateError(
    page,
    '/users/me/email',
    emailSubmit(page),
    409,
    'Email already registered',
    'Bu e-posta adresi zaten kayıtlı.'
  )

  await expectActiveSession(page, request, token)

  const profile = await openSettings(page)

  expect(profile.email).toBe(user.email)
})

test('email update rejects the existing email address', async ({ page, request }) => {
  const user = await createAuthenticatedUser(page, request)

  await openSettings(page)

  const token = await getToken(page)

  await fillEmailForm(
    page, user.email, user.password
  )

  await expectUpdateError(
    page,
    '/users/me/email',
    emailSubmit(page),
    400,
    'New email must be different',
    'Yeni e-posta adresiniz farklı olmalıdır.'
  )

  await expectActiveSession(page, request, token)
})

test('invalid email is blocked by browser validation', async ({ page, request }) => {
  const user = await createAuthenticatedUser(page, request)

  await openSettings(page)

  const token = await getToken(page)

  await fillEmailForm(
    page, 'invalid-email', user.password
  )

  const field = emailPanel(page).getByLabel(
    'Yeni e-posta adresi'
  )

  await emailSubmit(page).click()

  expect(
    await field.evaluate(
      input => input.validity.typeMismatch
    )
  ).toBe(true)

  await expectActiveSession(page, request, token)

  const profile = await openSettings(page)

  expect(profile.email).toBe(user.email)
})

test('password update invalidates old sessions and allows login with new password', async ({ page, request, browser }) => {
  const user = await createAuthenticatedUser(page, request)

  await openSettings(page)

  const oldToken = await getToken(page)

  const secondContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  })

  try {
    const secondPage = await secondContext.newPage()

    await login(secondPage, user)

    const secondToken = await getToken(secondPage)

    await verifyToken(request, oldToken, 200)
    await verifyToken(request, secondToken, 200)

    await fillPasswordForm(
      page, user.password, newPassword
    )

    const result = await submitSuccessfulUpdate(
      page,
      '/users/me/password',
      passwordSubmit(page),
      'Şifreniz güncellendi. Lütfen tekrar giriş yapın.'
    )

    expect(result.message).toBe(
      'Password updated successfully. Please log in again.'
    )

    await verifyToken(request, oldToken, 401)
    await verifyToken(request, secondToken, 401)

    const [response] = await Promise.all([
      waitForApiResponse(secondPage, '/users/me', 'GET'),
      secondPage.goto('/settings'),
    ])

    expect(response.status()).toBe(401)

    await expectLoggedOut(secondPage)

    await expectRejectedLogin(page, user)

    await login(page, {
      ...user,
      password: newPassword,
    })

    const profile = await openSettings(page)

    expect(profile.id).toBe(user.id)
    expect(profile.email).toBe(user.email)

    await verifyToken(
      request, await getToken(page), 200
    )

    await verifyToken(request, oldToken, 401)
  } finally {
    await secondContext.close()
  }
})

test('password update rejects incorrect current password', async ({ page, request }) => {
  await createAuthenticatedUser(page, request)

  await openSettings(page)

  const token = await getToken(page)

  await fillPasswordForm(
    page, wrongPassword, newPassword
  )

  await expectUpdateError(
    page,
    '/users/me/password',
    passwordSubmit(page),
    400,
    'Incorrect current password',
    'Mevcut şifreniz yanlış.'
  )

  await expectActiveSession(page, request, token)
})

test('password update rejects mismatched confirmation', async ({ page, request }) => {
  const user = await createAuthenticatedUser(page, request)

  await openSettings(page)

  const token = await getToken(page)

  await fillPasswordForm(
    page,
    user.password,
    newPassword,
    'Different-E2E-Password123!'
  )

  await passwordSubmit(page).click()

  await expect(
    page.getByText(
      'Yeni şifreler eşleşmiyor.',
      { exact: true }
    )
  ).toBeVisible()

  await expectActiveSession(page, request, token)
})

test('password update rejects reuse of current password', async ({ page, request }) => {
  const user = await createAuthenticatedUser(page, request)

  await openSettings(page)

  const token = await getToken(page)

  await fillPasswordForm(
    page, user.password, user.password
  )

  await passwordSubmit(page).click()

  await expect(
    page.getByText(
      'Yeni şifreniz mevcut şifrenizden farklı olmalıdır.',
      { exact: true }
    )
  ).toBeVisible()

  await expectActiveSession(page, request, token)
})

test('short new password is blocked by browser validation', async ({ page, request }) => {
  const user = await createAuthenticatedUser(page, request)

  await openSettings(page)

  const token = await getToken(page)

  await fillPasswordForm(
    page, user.password, 'short'
  )

  const field = passwordPanel(page).getByLabel(
    'Yeni şifre', { exact: true }
  )

  await passwordSubmit(page).click()

  expect(
    await field.evaluate(
      input => input.validity.tooShort
    )
  ).toBe(true)

  await expectActiveSession(page, request, token)
})

test('repeated account update attempts trigger rate limiting', async ({ page, request }) => {
  await createAuthenticatedUser(page, request)

  await openSettings(page)

  const token = await getToken(page)

  await fillPasswordForm(
    page, wrongPassword, newPassword
  )

  for (let attempt = 0; attempt < 5; attempt++) {
    await expectUpdateError(
      page,
      '/users/me/password',
      passwordSubmit(page),
      400,
      'Incorrect current password',
      'Mevcut şifreniz yanlış.'
    )
  }

  const [response] = await Promise.all([
    waitForApiResponse(
      page, '/users/me/password', 'PUT'
    ),
    passwordSubmit(page).click(),
  ])

  expect(response.status()).toBe(429)

  const retryAfter = Number(
    response.headers()['retry-after']
  )

  expect(Number.isInteger(retryAfter)).toBe(true)
  expect(retryAfter).toBeGreaterThan(0)
  expect(retryAfter).toBeLessThanOrEqual(60)

  await expect(
    page.getByText(
      `Çok fazla işlem yaptınız. Lütfen ${retryAfter} saniye sonra tekrar deneyin.`,
      { exact: true }
    )
  ).toBeVisible()

  await expect(passwordSubmit(page)).toBeEnabled()

  await expectActiveSession(page, request, token)
})
