import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:3100'

if (process.env.LABMANAGER_E2E !== '1') {
  throw new Error(
    'Playwright requires the isolated LabManager E2E environment'
  )
}

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',

  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,

  timeout: 120_000,

  expect: {
    timeout: 5_000,
  },

  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],

  outputDir: 'test-results',

  webServer: {
    command: 'npm run dev:e2e',
    url: baseURL + '/api/health',
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },


  use: {
    baseURL,
    headless: true,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
})
