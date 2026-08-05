import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  acceptTerms,
  captureEvidencePhoto,
  expectCurrentState,
  fillEscrowDetails,
  login,
  registerAndLogin,
  registerUser,
  type TestUser,
} from './helpers';

async function createEscrowWithInvite(page: Page, item: string): Promise<string> {
  await page.goto('/escrow/new');
  await fillEscrowDetails(page, { role: 'Buyer', item, priceMajor: '2000.00' });

  await captureEvidencePhoto(page);
  await page.getByRole('button', { name: /^Continue \(1 photo\)$/ }).click();
  await page.getByRole('button', { name: 'Invite counterparty' }).click();

  const inviteInput = page.locator('input[readonly]');
  await expect(inviteInput).toBeVisible();
  return inviteInput.inputValue();
}

async function openAs(browser: Browser, user: TestUser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, user);
  return page;
}

test.describe('Invite acceptance and agreement (F3)', () => {
  test('two parties reach AGREED — initiator invites, counterparty accepts', async ({
    page,
    browser,
  }) => {
    const item = 'A vintage camera';
    await registerAndLogin(page, 'initiator');
    const counterparty = await registerUser('counterparty');

    const inviteUrl = await createEscrowWithInvite(page, item);

    const counterpartyPage = await openAs(browser, counterparty);
    await counterpartyPage.goto(inviteUrl);

    await expect(
      counterpartyPage.getByRole('heading', { name: /you've been invited to an escrow/i }),
    ).toBeVisible();
    await expect(counterpartyPage.getByText(item)).toBeVisible();

    await counterpartyPage.getByRole('button', { name: 'Accept invite' }).click();
    await counterpartyPage.waitForURL(/\/escrow\/[0-9a-f-]+$/);

    await acceptTerms(counterpartyPage);
    await expect(counterpartyPage.getByText(/waiting for the other party/i)).toBeVisible();

    const escrowUrl = counterpartyPage.url().replace(/^https?:\/\/[^/]+/, '');
    await page.goto(escrowUrl);
    await acceptTerms(page);

    await expectCurrentState(page, 'Terms agreed');
    await expect(page.getByText('Frozen')).toBeVisible();

    await counterpartyPage.reload();
    await expectCurrentState(counterpartyPage, 'Terms agreed');

    await counterpartyPage.context().close();
  });

  test('shows a clear error for an invite token that does not exist', async ({ page }) => {
    await registerAndLogin(page, 'bad-invite');

    await page.goto('/invite/this-token-does-not-exist');

    await expect(page.getByRole('link', { name: 'Go to your dashboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept invite' })).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: /you've been invited to an escrow/i }),
    ).toHaveCount(0);
  });

  test('a used invite cannot be redeemed a second time', async ({ page, browser }) => {
    await registerAndLogin(page, 'initiator-2');
    const first = await registerUser('first-acceptor');
    const second = await registerUser('second-acceptor');

    const inviteUrl = await createEscrowWithInvite(page, 'A pair of speakers');

    const firstPage = await openAs(browser, first);
    await firstPage.goto(inviteUrl);
    await firstPage.getByRole('button', { name: 'Accept invite' }).click();
    await firstPage.waitForURL(/\/escrow\/[0-9a-f-]+$/);
    await firstPage.context().close();

    const secondPage = await openAs(browser, second);
    await secondPage.goto(inviteUrl);

    await expect(secondPage.getByRole('button', { name: 'Accept invite' })).toHaveCount(0);
    await expect(secondPage.getByRole('link', { name: 'Go to your dashboard' })).toBeVisible();

    await secondPage.context().close();
  });
});
