import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, request, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { Client } from 'pg';
import {
  API_URL,
  BOOTSTRAP_ADMIN_EMAIL,
  HANDOFF_PATH,
  PAYSTACK_SECRET,
  type StackHandoff,
} from './stack';

export const PASSWORD = 'super-secret-password';

let bootstrapAdmin: TestUser | null = null;

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

/**
 * Registration always sends a verification code, and login refuses an
 * unverified account — so a freshly registered test user cannot log in at all.
 * The code only exists in the API process's in-memory fake mailer, which this
 * process cannot read, so the suite marks the address verified directly in the
 * e2e database instead, exactly as the API's own e2e specs do through the
 * repository.
 */
async function markEmailVerified(email: string): Promise<void> {
  const { databaseUrl } = JSON.parse(readFileSync(HANDOFF_PATH, 'utf8')) as StackHandoff;
  const client = new Client({ connectionString: databaseUrl });

  await client.connect();
  try {
    await client.query('UPDATE users SET email_verified_at = now() WHERE lower(email) = lower($1)', [
      email,
    ]);
  } finally {
    await client.end();
  }
}

/**
 * The API promotes any email listed in BOOTSTRAP_ADMIN_EMAILS to ADMIN on
 * registration — the only way to mint the first privileged account, and the only
 * way this suite can drive the arbiter console. Registered once per run.
 */
export async function registerBootstrapAdmin(): Promise<TestUser> {
  if (bootstrapAdmin) {
    return bootstrapAdmin;
  }

  const api = await apiContext();
  const response = await api.post('/auth/register', {
    data: { email: BOOTSTRAP_ADMIN_EMAIL, password: PASSWORD },
  });
  expect(response.ok(), `register bootstrap admin: ${await response.text()}`).toBe(true);
  await api.dispose();
  await markEmailVerified(BOOTSTRAP_ADMIN_EMAIL);

  bootstrapAdmin = { email: BOOTSTRAP_ADMIN_EMAIL, password: PASSWORD };
  return bootstrapAdmin;
}

export async function registerUser(prefix: string): Promise<TestUser> {
  const api = await apiContext();
  const email = uniqueEmail(prefix);

  const response = await api.post('/auth/register', { data: { email, password: PASSWORD } });
  expect(response.ok(), `register ${email}: ${await response.text()}`).toBe(true);

  await api.dispose();
  await markEmailVerified(email);
  return { email, password: PASSWORD };
}

/**
 * A tier is only ever granted by an admin reviewing uploaded documents. The
 * specs that call this need a verified buyer as a precondition, not a test of
 * that review, so the tier is set directly in the e2e database — the same
 * shortcut markEmailVerified takes.
 */
export async function grantTier1(user: TestUser): Promise<void> {
  const { databaseUrl } = JSON.parse(readFileSync(HANDOFF_PATH, 'utf8')) as StackHandoff;
  const client = new Client({ connectionString: databaseUrl });

  await client.connect();
  try {
    const result = await client.query(
      "UPDATE users SET kyc_tier = 'TIER_1' WHERE lower(email) = lower($1)",
      [user.email],
    );
    expect(result.rowCount, `grant TIER_1 to ${user.email}`).toBe(1);
  } finally {
    await client.end();
  }
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
 * A state label appears twice on the escrow and dispute pages — once in the
 * header, once in the timeline — so assert against the step marked as current.
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

export async function openAs(browser: Browser, user: TestUser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, user);
  return page;
}

export async function stubPaystackCheckout(page: Page): Promise<void> {
  await page.route('https://checkout.fake-paystack.test/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body><h1>Paystack test checkout</h1></body></html>',
    });
  });
}

async function accessTokenFor(user: TestUser): Promise<string> {
  const api = await apiContext();
  const response = await api.post('/auth/login', {
    data: { email: user.email, password: user.password },
  });
  const { accessToken } = (await response.json()) as { accessToken: string };
  await api.dispose();
  return accessToken;
}

export async function readIntentReference(user: TestUser, escrowId: string): Promise<string> {
  const accessToken = await accessTokenFor(user);
  const api = await apiContext();

  const response = await api.get(`/payments/escrows/${escrowId}/intent`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const { intent } = (await response.json()) as { intent: { reference: string } | null };
  await api.dispose();

  if (!intent) {
    throw new Error(`No payment intent found for escrow ${escrowId}`);
  }
  return intent.reference;
}

/**
 * Drives the buyer-initiated create → invite → both-accept flow through the UI and
 * returns the escrow's path, which is how every later step addresses it.
 */
export async function createAgreedEscrow(
  buyerPage: Page,
  browser: Browser,
  seller: TestUser,
  options: { item: string; priceMajor: string },
): Promise<string> {
  await buyerPage.goto('/escrow/new');
  await fillEscrowDetails(buyerPage, { role: 'Buyer', ...options });

  await captureEvidencePhoto(buyerPage);
  await buyerPage.getByRole('button', { name: /^Continue \(1 photo\)$/ }).click();
  await buyerPage.getByRole('button', { name: 'Invite counterparty' }).click();

  const inviteUrl = await buyerPage.locator('input[readonly]').inputValue();

  const sellerPage = await openAs(browser, seller);
  await sellerPage.goto(inviteUrl);
  await sellerPage.getByRole('button', { name: 'Accept invite' }).click();
  await sellerPage.waitForURL(/\/escrow\/[0-9a-f-]+$/);
  await acceptTerms(sellerPage);
  await expect(sellerPage.getByText(/waiting for the other party/i)).toBeVisible();

  const escrowPath = sellerPage.url().replace(/^https?:\/\/[^/]+/, '');
  await sellerPage.context().close();

  await buyerPage.goto(escrowPath);
  await acceptTerms(buyerPage);
  await expectCurrentState(buyerPage, 'Terms agreed');

  return escrowPath;
}

export async function fundEscrow(
  buyerPage: Page,
  buyer: TestUser,
  escrowPath: string,
  priceKobo: number,
): Promise<void> {
  await stubPaystackCheckout(buyerPage);
  await buyerPage.goto(`${escrowPath}/fund`);
  await buyerPage.getByRole('button', { name: /^Fund/ }).click();
  await buyerPage.waitForURL('https://checkout.fake-paystack.test/**');

  const escrowId = escrowPath.split('/').pop() as string;
  const reference = await readIntentReference(buyer, escrowId);
  await sendPaystackWebhook(chargeSuccess(reference, priceKobo));

  await buyerPage.goto(escrowPath);
  await expectCurrentState(buyerPage, 'Payment funded');
}

export async function confirmInModal(page: Page, confirmLabel: string): Promise<void> {
  await page.getByRole('dialog').getByRole('button', { name: confirmLabel }).click();
}

export async function acceptTerms(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Accept terms' }).click();
  await page.getByRole('dialog').getByRole('checkbox').check();
  await confirmInModal(page, 'Accept terms');
}
