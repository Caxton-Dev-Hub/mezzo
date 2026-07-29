import { createHmac, randomUUID } from 'node:crypto';
import { expect, request, type APIRequestContext, type Page } from '@playwright/test';
import { API_URL, PAYSTACK_SECRET } from './stack';

export const PASSWORD = 'super-secret-password';

export interface TestUser {
  email: string;
  password: string;
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

export async function apiContext(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: API_URL });
}

export async function registerUser(prefix: string): Promise<TestUser> {
  const api = await apiContext();
  const email = uniqueEmail(prefix);

  const response = await api.post('/auth/register', { data: { email, password: PASSWORD } });
  expect(response.ok(), `register ${email}: ${await response.text()}`).toBe(true);

  await api.dispose();
  return { email, password: PASSWORD };
}

export async function grantTier1(user: TestUser): Promise<void> {
  const api = await apiContext();

  const login = await api.post('/auth/login', {
    data: { email: user.email, password: user.password },
  });
  const { accessToken } = (await login.json()) as { accessToken: string };

  const submission = await api.post('/kyc/submissions', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { tier: 'TIER_1' },
  });
  expect(submission.ok(), `kyc submission: ${await submission.text()}`).toBe(true);
  const { providerReference } = (await submission.json()) as { providerReference: string };

  const callback = await api.post('/kyc/webhook', {
    data: { providerReference, status: 'APPROVED' },
  });
  expect(callback.ok(), `kyc webhook: ${await callback.text()}`).toBe(true);

  await api.dispose();
}

export async function login(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();
}

export async function registerAndLogin(page: Page, prefix: string): Promise<TestUser> {
  const user = await registerUser(prefix);
  await login(page, user);
  return user;
}

export async function sendPaystackWebhook(payload: Record<string, unknown>): Promise<void> {
  const api = await apiContext();
  const body = JSON.stringify(payload);

  const response = await api.post('/payments/webhook/paystack', {
    headers: {
      'content-type': 'application/json',
      'x-paystack-signature': createHmac('sha512', PAYSTACK_SECRET).update(body).digest('hex'),
    },
    data: body,
  });
  expect(response.ok(), `paystack webhook: ${await response.text()}`).toBe(true);

  await api.dispose();
}

export function chargeSuccess(reference: string, amountKobo: number): Record<string, unknown> {
  return {
    event: 'charge.success',
    data: {
      id: randomUUID(),
      reference,
      amount: amountKobo,
      currency: 'NGN',
      status: 'success',
    },
  };
}

const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export function fakePhoto(name = 'item.png'): {
  name: string;
  mimeType: string;
  buffer: Buffer;
} {
  return { name, mimeType: 'image/png', buffer: Buffer.from(PNG_1X1_BASE64, 'base64') };
}

/**
 * The state label appears twice on the escrow page — once in the header, once in
 * the timeline — so assert against the timeline step the app marks as current.
 */
export async function expectCurrentState(page: Page, label: string): Promise<void> {
  await expect(page.locator('[aria-current="step"]').filter({ hasText: label })).toBeVisible();
}

/**
 * Every state label is present in the timeline as a past or future step, so
 * "not in this state" has to be asserted against the current step specifically.
 */
export async function expectNotCurrentState(page: Page, label: string): Promise<void> {
  await expect(page.locator('[aria-current="step"]').filter({ hasText: label })).toHaveCount(0);
}

export async function captureEvidencePhoto(page: Page): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles(fakePhoto());
  await expect(page.getByRole('button', { name: /^Continue \(1 photo\)$/ })).toBeEnabled({
    timeout: 30_000,
  });
}

export async function fillEscrowDetails(
  page: Page,
  options: { role: 'Buyer' | 'Seller'; item: string; priceMajor: string },
): Promise<void> {
  await page.getByText(options.role, { exact: true }).click();
  await page.getByLabel('Item description').fill(options.item);
  await page.getByLabel('Price').fill(options.priceMajor);
  await page.getByLabel('Delivery method').fill('GIG Logistics');
  await page.getByLabel('Inspection window (hours)').fill('48');
  await page.getByRole('button', { name: 'Continue' }).click();
}
