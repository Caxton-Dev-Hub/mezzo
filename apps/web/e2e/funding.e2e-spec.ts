import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  apiContext,
  captureEvidencePhoto,
  chargeSuccess,
  expectCurrentState,
  expectNotCurrentState,
  fillEscrowDetails,
  grantTier1,
  login,
  registerAndLogin,
  registerUser,
  sendPaystackWebhook,
  type TestUser,
} from './helpers';

const PRICE_MAJOR = '1200.00';
const PRICE_KOBO = 120_000;

async function openAs(browser: Browser, user: TestUser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, user);
  return page;
}

async function createAgreedEscrow(
  buyerPage: Page,
  browser: Browser,
  seller: TestUser,
): Promise<string> {
  await buyerPage.goto('/escrow/new');
  await fillEscrowDetails(buyerPage, {
    role: 'Buyer',
    item: 'A vintage camera',
    priceMajor: PRICE_MAJOR,
  });

  await captureEvidencePhoto(buyerPage);
  await buyerPage.getByRole('button', { name: /^Continue \(1 photo\)$/ }).click();
  await buyerPage.getByRole('button', { name: 'Invite counterparty' }).click();

  const inviteUrl = await buyerPage.locator('input[readonly]').inputValue();

  const sellerPage = await openAs(browser, seller);
  await sellerPage.goto(inviteUrl);
  await sellerPage.getByRole('button', { name: 'Accept invite' }).click();
  await sellerPage.waitForURL(/\/escrow\/[0-9a-f-]+$/);
  await sellerPage.getByRole('button', { name: 'Accept terms' }).click();
  await expect(sellerPage.getByText(/waiting for the other party/i)).toBeVisible();

  const escrowPath = sellerPage.url().replace(/^https?:\/\/[^/]+/, '');
  await sellerPage.context().close();

  await buyerPage.goto(escrowPath);
  await buyerPage.getByRole('button', { name: 'Accept terms' }).click();
  await expectCurrentState(buyerPage, 'Terms agreed');

  return escrowPath;
}

async function stubPaystackCheckout(page: Page): Promise<void> {
  await page.route('https://checkout.fake-paystack.test/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body><h1>Paystack test checkout</h1></body></html>',
    });
  });
}

async function escrowIdForInvite(inviteUrl: string): Promise<string> {
  const token = new URL(inviteUrl).pathname.split('/').pop() as string;
  const api = await apiContext();
  const response = await api.get(`/invites/${token}`);
  const { escrowId } = (await response.json()) as { escrowId: string };
  await api.dispose();
  return escrowId;
}

async function readIntentReference(user: TestUser, escrowId: string): Promise<string> {
  const api = await apiContext();
  const loginResponse = await api.post('/auth/login', {
    data: { email: user.email, password: user.password },
  });
  const { accessToken } = (await loginResponse.json()) as { accessToken: string };

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

test.describe('Funding an escrow (F4)', () => {
  test('reaches FUNDED only after the verified webhook, never on the checkout return', async ({
    page,
    browser,
  }) => {
    const buyer = await registerAndLogin(page, 'fund-buyer');
    await grantTier1(buyer);
    const seller = await registerUser('fund-seller');

    const escrowPath = await createAgreedEscrow(page, browser, seller);
    const escrowId = escrowPath.split('/').pop() as string;

    await stubPaystackCheckout(page);
    await page.getByRole('link', { name: 'Fund escrow' }).click();
    await expect(page.getByRole('heading', { name: 'Fund this escrow' })).toBeVisible();

    await page.getByRole('button', { name: /^Fund/ }).click();

    // The browser follows Paystack's redirect; the API has not been told anything yet.
    await page.waitForURL('https://checkout.fake-paystack.test/**');
    await expect(page.getByRole('heading', { name: 'Paystack test checkout' })).toBeVisible();

    // Returning from checkout is a client-side signal only: still not funded.
    await page.goto(`${escrowPath}/fund`);
    await expect(page.getByText(/confirming payment/i)).toBeVisible();
    await expect(page.getByText(/payment confirmed/i)).toHaveCount(0);

    await page.goto(escrowPath);
    await expectCurrentState(page, 'Terms agreed');
    await expectNotCurrentState(page, 'Payment funded');

    // Only the signed provider webhook may move the escrow.
    const reference = await readIntentReference(buyer, escrowId);
    await sendPaystackWebhook(chargeSuccess(reference, PRICE_KOBO));

    await page.goto(`${escrowPath}/fund`);
    await expect(page.getByText(/payment confirmed/i)).toBeVisible();

    await page.goto(escrowPath);
    await expectCurrentState(page, 'Payment funded');
    await expect(page.getByRole('button', { name: 'Mark as shipped' })).toHaveCount(0);
  });

  test('shows the funded amount as held in escrow on the wallet, not as available', async ({
    page,
    browser,
  }) => {
    const buyer = await registerAndLogin(page, 'wallet-buyer');
    await grantTier1(buyer);
    const seller = await registerUser('wallet-seller');

    const escrowPath = await createAgreedEscrow(page, browser, seller);
    const escrowId = escrowPath.split('/').pop() as string;

    await stubPaystackCheckout(page);
    await page.goto(`${escrowPath}/fund`);
    await page.getByRole('button', { name: /^Fund/ }).click();
    await page.waitForURL('https://checkout.fake-paystack.test/**');

    const reference = await readIntentReference(buyer, escrowId);
    await sendPaystackWebhook(chargeSuccess(reference, PRICE_KOBO));

    await page.goto('/wallet');
    await expect(page.getByRole('heading', { name: 'Wallet' })).toBeVisible();

    await expect(
      page.getByRole('region', { name: 'Held in escrow' }).getByText('₦1,200.00'),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Available' }).getByText('₦0.00')).toBeVisible();
  });

  test('offers no funding entry point on an escrow that is not AGREED', async ({ page }) => {
    const buyer = await registerAndLogin(page, 'not-agreed-buyer');
    await grantTier1(buyer);

    await page.goto('/escrow/new');
    await fillEscrowDetails(page, {
      role: 'Buyer',
      item: 'A film scanner',
      priceMajor: '400.00',
    });
    await captureEvidencePhoto(page);
    await page.getByRole('button', { name: /^Continue \(1 photo\)$/ }).click();
    await page.getByRole('button', { name: 'Invite counterparty' }).click();

    const inviteUrl = await page.locator('input[readonly]').inputValue();
    const escrowId = await escrowIdForInvite(inviteUrl);

    // The counterparty never accepted, so this escrow is still PENDING_COUNTERPARTY.
    await page.goto(`/escrow/${escrowId}`);
    await expectCurrentState(page, 'Waiting for counterparty');
    await expect(page.getByRole('link', { name: 'Fund escrow' })).toHaveCount(0);

    await page.goto(`/escrow/${escrowId}/fund`);
    await expect(page.getByText(/funding is only available/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Fund/ })).toHaveCount(0);
  });
});
