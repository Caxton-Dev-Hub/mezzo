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

async function agreeEscrow(page: Page, browser: Browser, item: string): Promise<{ counterpartyPage: Page }> {
  const counterparty = await registerUser('chat-counterparty');
  const inviteUrl = await createEscrowWithInvite(page, item);

  const counterpartyPage = await openAs(browser, counterparty);
  await counterpartyPage.goto(inviteUrl);
  await counterpartyPage.getByRole('button', { name: 'Accept invite' }).click();
  await counterpartyPage.waitForURL(/\/escrow\/[0-9a-f-]+$/);
  await acceptTerms(counterpartyPage);

  const escrowUrl = counterpartyPage.url().replace(/^https?:\/\/[^/]+/, '');
  await page.goto(escrowUrl);
  await acceptTerms(page);
  await expectCurrentState(page, 'Terms agreed');

  return { counterpartyPage };
}

test.describe('Order chat & realtime (F5)', () => {
  test('a message sent by one party appears for the other party in realtime', async ({ page, browser }) => {
    await registerAndLogin(page, 'chat-initiator');
    const { counterpartyPage } = await agreeEscrow(page, browser, 'A leather satchel');

    const chatInput = page.getByPlaceholder('Write a message');
    await chatInput.fill('Is this still available?');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText('Is this still available?')).toBeVisible();
    await expect(counterpartyPage.getByText('Is this still available?')).toBeVisible({ timeout: 10_000 });

    await counterpartyPage.context().close();
  });

  test('a non-party cannot see the chat conversation for an escrow', async ({ page, browser }) => {
    await registerAndLogin(page, 'chat-initiator-2');
    await agreeEscrow(page, browser, 'A record player');

    const escrowUrl = page.url();
    const stranger = await registerUser('chat-stranger');
    const strangerPage = await openAs(browser, stranger);
    await strangerPage.goto(escrowUrl);

    await expect(strangerPage.getByRole('heading', { name: 'A record player' })).toHaveCount(0);
    await expect(strangerPage.getByPlaceholder('Write a message')).toHaveCount(0);

    await strangerPage.context().close();
  });
});
