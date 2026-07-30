import { expect, test, type Page } from '@playwright/test';
import {
  confirmInModal,
  createAgreedEscrow,
  expectCurrentState,
  fakePhoto,
  fundEscrow,
  grantTier1,
  openAs,
  registerAndLogin,
  registerBootstrapAdmin,
  registerUser,
  type TestUser,
} from './helpers';

const PRICE_MAJOR = '1200.00';
const PRICE_KOBO = 120_000;

async function raiseDisputeOn(buyerPage: Page, escrowPath: string): Promise<string> {
  await buyerPage.goto(escrowPath);
  await buyerPage.getByRole('button', { name: 'Confirm delivery' }).click();
  await confirmInModal(buyerPage, 'Confirm delivery');
  await expectCurrentState(buyerPage, 'Delivery confirmed');

  await buyerPage.getByRole('button', { name: 'Raise a dispute' }).click();
  const modal = buyerPage.getByRole('dialog');
  await modal.getByLabel('Reason').selectOption('NOT_AS_DESCRIBED');
  await modal.getByLabel('What happened?').fill('The body is scratched and the lens is loose.');
  await modal.locator('input[type="file"]').setInputFiles(fakePhoto());
  await modal.getByRole('button', { name: 'Raise dispute' }).click();

  await buyerPage.waitForURL(/\/disputes\/[0-9a-f-]+$/);
  return buyerPage.url().split('/').pop() as string;
}

async function disputedEscrow(
  buyerPage: Page,
  browser: Parameters<typeof openAs>[0],
  buyer: TestUser,
  seller: TestUser,
  item: string,
): Promise<{ escrowPath: string; disputeId: string }> {
  const escrowPath = await createAgreedEscrow(buyerPage, browser, seller, {
    item,
    priceMajor: PRICE_MAJOR,
  });
  await fundEscrow(buyerPage, buyer, escrowPath, PRICE_KOBO);

  const sellerPage = await openAs(browser, seller);
  await sellerPage.goto(escrowPath);
  await sellerPage.getByRole('button', { name: 'Mark as shipped' }).click();
  await confirmInModal(sellerPage, 'Mark as shipped');
  await expectCurrentState(sellerPage, 'Marked as shipped');
  await sellerPage.context().close();

  const disputeId = await raiseDisputeOn(buyerPage, escrowPath);
  return { escrowPath, disputeId };
}

test.describe('Arbiter console (F7)', () => {
  test('an arbiter reviews the packet and executes a refund that credits the buyer', async ({
    page,
    browser,
  }) => {
    const buyer = await registerAndLogin(page, 'arbiter-buyer');
    await grantTier1(buyer);
    const seller = await registerUser('arbiter-seller');

    const { escrowPath, disputeId } = await disputedEscrow(
      page,
      browser,
      buyer,
      seller,
      'A vintage camera',
    );

    const admin = await registerBootstrapAdmin();
    const adminPage = await openAs(browser, admin);

    await adminPage.goto('/admin');
    await expect(adminPage.getByRole('heading', { name: 'Dispute queue' })).toBeVisible();
    await adminPage.getByRole('link', { name: /Not as described/ }).first().click();
    await adminPage.waitForURL(/\/admin\/disputes\/[0-9a-f-]+$/);
    expect(adminPage.url()).toContain(disputeId);

    // The packet is all there: the claim, the evidence, and the AI's own view of it.
    await expect(adminPage.getByText('The body is scratched and the lens is loose.')).toBeVisible();
    await expect(adminPage.getByRole('region', { name: "Buyer's evidence" })).toBeVisible();

    const recommendation = adminPage.getByRole('region', { name: 'AI recommendation' });
    await recommendation.getByRole('button', { name: 'Run AI analysis' }).click();
    await expect(recommendation.getByText(/Proposes:|Abstained/)).toBeVisible({ timeout: 30_000 });

    // Nothing can be resolved while both parties can still file evidence.
    const evidenceWindow = adminPage.getByRole('region', { name: 'Close evidence window' });
    await expect(evidenceWindow).toBeVisible();
    await expect(adminPage.getByRole('region', { name: 'Execute resolution' })).toHaveCount(0);
    await evidenceWindow.getByRole('button', { name: 'Close evidence window' }).click();

    // The arbiter disagrees or agrees, but always decides: nothing executes without this.
    const form = adminPage.getByRole('region', { name: 'Execute resolution' });
    await form.getByRole('radio', { name: 'Refunded to the buyer' }).check();
    await expect(form.getByText('₦1,200.00').first()).toBeVisible();
    await form.getByRole('button', { name: 'Review and execute' }).click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toContainText('Refunded to the buyer');
    await dialog.getByRole('button', { name: 'Execute resolution' }).click();

    await expect(adminPage.getByRole('region', { name: 'Executed resolution' })).toContainText(
      'Refunded to the buyer',
    );
    await expect(adminPage.getByRole('region', { name: 'Audit trail' })).toContainText(
      'Resolution executed',
    );
    await adminPage.context().close();

    // The escrow settles and the money lands in the buyer's wallet.
    await page.goto(escrowPath);
    await expectCurrentState(page, 'Funds refunded');

    await page.goto('/wallet');
    await expect(
      page.getByRole('region', { name: 'Available' }).getByText('₦1,200.00'),
    ).toBeVisible();
  });

  test('a party cannot open the arbiter console', async ({ page }) => {
    await registerAndLogin(page, 'console-outsider');

    await page.goto('/admin');
    await expect(page.getByText('This area is for arbiters only.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dispute queue' })).toHaveCount(0);

    await page.goto('/admin/disputes/00000000-0000-4000-8000-000000000000');
    await expect(page.getByText('This area is for arbiters only.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Execute resolution' })).toHaveCount(0);
  });
});
