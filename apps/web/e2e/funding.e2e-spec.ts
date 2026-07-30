import { expect, test } from '@playwright/test';
import {
  apiContext,
  captureEvidencePhoto,
  chargeSuccess,
  createAgreedEscrow,
  expectCurrentState,
  expectNotCurrentState,
  fillEscrowDetails,
  grantTier1,
  readIntentReference,
  registerAndLogin,
  registerUser,
  sendPaystackWebhook,
  stubPaystackCheckout,
} from './helpers';

const PRICE_MAJOR = '1200.00';
const PRICE_KOBO = 120_000;
const ITEM = 'A vintage camera';

async function escrowIdForInvite(inviteUrl: string): Promise<string> {
  const token = new URL(inviteUrl).pathname.split('/').pop() as string;
  const api = await apiContext();
  const response = await api.get(`/invites/${token}`);
  const { escrowId } = (await response.json()) as { escrowId: string };
  await api.dispose();
  return escrowId;
}

test.describe('Funding an escrow (F4)', () => {
  test('reaches FUNDED only after the verified webhook, never on the checkout return', async ({
    page,
    browser,
  }) => {
    const buyer = await registerAndLogin(page, 'fund-buyer');
    await grantTier1(buyer);
    const seller = await registerUser('fund-seller');

    const escrowPath = await createAgreedEscrow(page, browser, seller, {
      item: ITEM,
      priceMajor: PRICE_MAJOR,
    });
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

    const escrowPath = await createAgreedEscrow(page, browser, seller, {
      item: ITEM,
      priceMajor: PRICE_MAJOR,
    });
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
