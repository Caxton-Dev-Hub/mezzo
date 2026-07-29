import { defineConfig, devices } from '@playwright/test';
import { WEB_URL } from './e2e/stack';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e-spec.ts',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 240_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? 'line' : [['list']],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    actionTimeout: 45_000,
    navigationTimeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
