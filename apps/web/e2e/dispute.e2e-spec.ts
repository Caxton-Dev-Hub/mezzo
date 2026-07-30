import { expect, test, type Locator } from '@playwright/test';
import {
  confirmInModal,
  createAgreedEscrow,
  expectCurrentState,
  fakePhoto,
  fundEscrow,
  grantTier1,
  openAs,
  registerAndLogin,
  registerUser,
} from './helpers';

const PRICE_MAJOR = '1200.00';
const PRICE_KOBO = 120_000;

async function submitEvidenceIn(container: Locator): Promise<void> {
  await container.locator('input[type="file"]').setInputFiles(fakePhoto());
}

test.describe('Dispute center (F6)', () => {
  test('buyer raises a dispute with evidence, then the seller rebuts', async ({ page, browser }) => {
    const buyer = await registerAndLogin(page, 'dispute-buyer');
    await grantTier1(buyer);
    const seller = await registerUser('dispute-seller');

    const escrowPath = await createAgreedEscrow(page, browser, seller, {
      item: 'A vintage camera',
      priceMajor: PRICE_MAJOR,
    });
    await fundEscrow(page, buyer, escrowPath, PRICE_KOBO);

    const sellerPage = await openAs(browser, seller);
    await sellerPage.goto(escrowPath);
    await sellerPage.getByRole('button', { name: 'Mark as shipped' }).click();
    await confirmInModal(sellerPage, 'Mark as shipped');
    await expectCurrentState(sellerPage, 'Marked as shipped');

    await page.goto(escrowPath);
    await page.getByRole('button', { name: 'Confirm delivery' }).click();
    await confirmInModal(page, 'Confirm delivery');
    await expectCurrentState(page, 'Delivery confirmed');

    // Raising a dispute needs a reason, a statement and at least one photo.
    await page.getByRole('button', { name: 'Raise a dispute' }).click();
    const disputeModal = page.getByRole('dialog');
    await expect(disputeModal.getByText(/freezes this escrow/i)).toBeVisible();

    const raiseButton = disputeModal.getByRole('button', { name: 'Raise dispute' });
    await expect(raiseButton).toBeDisabled();

    await disputeModal.getByLabel('Reason').selectOption('DAMAGED');
    await disputeModal.getByLabel('What happened?').fill('The lens arrived cracked.');
    await submitEvidenceIn(disputeModal);
    await expect(raiseButton).toBeEnabled({ timeout: 30_000 });

    await raiseButton.click();
    await page.waitForURL(/\/disputes\/[0-9a-f-]+$/);
    const disputePath = page.url().replace(/^https?:\/\/[^/]+/, '');

    await expect(page.getByRole('heading', { name: 'A vintage camera' })).toBeVisible();
    await expectCurrentState(page, 'Collecting evidence');
    await expect(page.getByRole('status')).toContainText('left to submit');
    await expect(page.getByText('The lens arrived cracked.')).toBeVisible();

    // Before the seller responds, each party sees only their own evidence.
    await expect(page.getByRole('region', { name: 'Your evidence' }).locator('button')).toHaveCount(1);
    await expect(page.getByRole('region', { name: "Seller's evidence" })).toContainText(
      'Visible once both parties have submitted',
    );

    // The seller reaches the dispute from the frozen escrow and rebuts.
    await sellerPage.goto(escrowPath);
    await expectCurrentState(sellerPage, 'Dispute raised');
    await sellerPage.getByRole('link', { name: 'Open the dispute center' }).click();
    await sellerPage.waitForURL(/\/disputes\/[0-9a-f-]+$/);

    const rebuttal = sellerPage.getByRole('region', { name: 'Respond to this dispute' });
    await expect(rebuttal).toBeVisible();
    await submitEvidenceIn(rebuttal);

    // Once both sides have submitted, each party sees the other's evidence.
    await expect(
      sellerPage.getByRole('region', { name: "Buyer's evidence" }).locator('button'),
    ).toHaveCount(1, { timeout: 30_000 });

    await page.goto(disputePath);
    await expect(page.getByRole('region', { name: "Seller's evidence" }).locator('button')).toHaveCount(
      1,
      { timeout: 30_000 },
    );

    // The arbiter's reasoning is never shown to a party (F7 surfaces it, arbiter-only).
    await expect(page.getByText(/rationale|confidence/i)).toHaveCount(0);

    await sellerPage.context().close();
  });

  test('a non-party cannot open the dispute', async ({ page, browser }) => {
    const buyer = await registerAndLogin(page, 'dispute-guard-buyer');
    await grantTier1(buyer);
    const seller = await registerUser('dispute-guard-seller');

    const escrowPath = await createAgreedEscrow(page, browser, seller, {
      item: 'A film scanner',
      priceMajor: PRICE_MAJOR,
    });
    await fundEscrow(page, buyer, escrowPath, PRICE_KOBO);

    const sellerPage = await openAs(browser, seller);
    await sellerPage.goto(escrowPath);
    await sellerPage.getByRole('button', { name: 'Mark as shipped' }).click();
    await confirmInModal(sellerPage, 'Mark as shipped');
    await sellerPage.context().close();

    await page.goto(escrowPath);
    await page.getByRole('button', { name: 'Confirm delivery' }).click();
    await confirmInModal(page, 'Confirm delivery');

    await page.getByRole('button', { name: 'Raise a dispute' }).click();
    const disputeModal = page.getByRole('dialog');
    await disputeModal.getByLabel('Reason').selectOption('NOT_RECEIVED');
    await disputeModal.getByLabel('What happened?').fill('It never arrived.');
    await submitEvidenceIn(disputeModal);
    await disputeModal.getByRole('button', { name: 'Raise dispute' }).click();
    await page.waitForURL(/\/disputes\/[0-9a-f-]+$/);
    const disputePath = page.url().replace(/^https?:\/\/[^/]+/, '');

    const stranger = await registerUser('dispute-stranger');
    const strangerPage = await openAs(browser, stranger);
    await strangerPage.goto(disputePath);

    await expect(strangerPage.getByText(/not a party/i)).toBeVisible();
    await expect(strangerPage.getByRole('heading', { name: 'A film scanner' })).toHaveCount(0);

    await strangerPage.context().close();
  });
});
