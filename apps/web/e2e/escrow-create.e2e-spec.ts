import { expect, test } from '@playwright/test';
import { captureEvidencePhoto, fillEscrowDetails, registerAndLogin } from './helpers';

test.describe('Escrow creation wizard (F2)', () => {
  test('runs details → evidence capture → invite link against the real API', async ({ page }) => {
    await registerAndLogin(page, 'creator');

    await page.goto('/escrow/new');
    await expect(page.getByText('Step 1 of 3 — Item details')).toBeVisible();

    await fillEscrowDetails(page, {
      role: 'Buyer',
      item: 'A vintage camera',
      priceMajor: '1500.00',
    });

    await expect(page.getByText('Step 2 of 3 — Evidence')).toBeVisible();
    await expect(page.getByText('No photos yet')).toBeVisible();

    await captureEvidencePhoto(page);
    await page.getByRole('button', { name: /^Continue \(1 photo\)$/ }).click();

    await expect(page.getByText('Step 3 of 3 — Review & invite')).toBeVisible();
    await expect(page.getByText('A vintage camera')).toBeVisible();
    await expect(page.getByText('1 photo')).toBeVisible();

    await page.getByRole('button', { name: 'Invite counterparty' }).click();

    const inviteInput = page.locator('input[readonly]');
    await expect(inviteInput).toBeVisible();
    await expect(inviteInput).toHaveValue(/\/invite\/[a-zA-Z0-9_-]+$/);
  });

  test('blocks the invite step until at least one photo is captured', async ({ page }) => {
    await registerAndLogin(page, 'no-photo');

    await page.goto('/escrow/new');
    await fillEscrowDetails(page, {
      role: 'Seller',
      item: 'A mechanical keyboard',
      priceMajor: '250.00',
    });

    await expect(page.getByText('Step 2 of 3 — Evidence')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  test('keeps the entered details when stepping back from evidence', async ({ page }) => {
    await registerAndLogin(page, 'back-nav');

    await page.goto('/escrow/new');
    await fillEscrowDetails(page, {
      role: 'Buyer',
      item: 'A road bicycle',
      priceMajor: '900.50',
    });

    await expect(page.getByText('Step 2 of 3 — Evidence')).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();

    await expect(page.getByText('Step 1 of 3 — Item details')).toBeVisible();
    await expect(page.getByLabel('Item description')).toHaveValue('A road bicycle');
    await expect(page.getByLabel('Price')).toHaveValue('900.50');
  });

  test('surfaces validation errors instead of advancing on an invalid price', async ({ page }) => {
    await registerAndLogin(page, 'invalid-price');

    await page.goto('/escrow/new');
    await page.getByLabel('Item description').fill('A guitar');
    await page.getByLabel('Price').fill('not-a-price');
    await page.getByLabel('Delivery method').fill('courier');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText('Enter a valid amount, e.g. 15000.00')).toBeVisible();
    await expect(page.getByText('Step 1 of 3 — Item details')).toBeVisible();
  });
});
