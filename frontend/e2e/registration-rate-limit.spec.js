import { test, expect } from '@playwright/test'

import {
  createCredentials,
  createUser,
} from './helpers.js'

test('registration helper retries after global rate limiting', async ({ request }) => {
  test.skip(
    process.env.LABMANAGER_E2E_RATE_LIMIT !== '1',
    'Requires a dedicated isolated rate limit run'
  )

  const credentials = createCredentials()

  const first = await request.post('/api/register', {
    data: credentials,
  })

  expect(first.status()).toBe(201)

  for (let attempt = 1; attempt < 30; attempt++) {
    const response = await request.post('/api/register', {
      data: createCredentials(),
    })

    expect(response.status()).toBe(201)
    await response.dispose()
  }

  const blocked = await request.post('/api/register', {
    data: createCredentials(),
  })

  expect(blocked.status()).toBe(429)

  const retryAfter = Number(
    blocked.headers()['retry-after']
  )

  expect(Number.isInteger(retryAfter)).toBe(true)
  expect(retryAfter).toBeGreaterThan(0)
  expect(retryAfter).toBeLessThanOrEqual(60)

  await blocked.dispose()

  const statuses = []
  const startedAt = Date.now()

  const trackedRequest = {
    async post(...args) {
      const response = await request.post(...args)
      statuses.push(response.status())
      return response
    },
  }

  const user = await createUser(trackedRequest)

  expect(statuses).toEqual([429, 201])
  expect(user.id).toBeGreaterThan(0)
  expect(user.email).toContain('@example.com')

  expect(Date.now() - startedAt)
    .toBeGreaterThanOrEqual(
      Math.max(0, retryAfter - 1) * 1000
    )
})
