import { expect, test } from '@playwright/test';
import { registerUser, uniqueEmail } from './helpers';

test.describe('Password reset', () => {
  test('reaches the request form from sign in and confirms the link was sent', async ({ page }) => {
    const user = await registerUser('reset-requester');

    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot password?' }).click();

    await expect(page).toHaveURL(/\/forgot-password$/);
    await page.getByLabel('Email').fill(user.email);
    await page.getByRole('button', { name: 'Send reset link' }).click();

    await expect(page.getByRole('status')).toContainText('a reset link is on its way');
  });

  test('gives the same confirmation for an email with no account', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill(uniqueEmail('no-such-account'));
    await page.getByRole('button', { name: 'Send reset link' }).click();

    await expect(page.getByRole('status')).toContainText('a reset link is on its way');
  });

  test('tells the user when the reset link carries no token', async ({ page }) => {
    await page.goto('/reset-password');

    await expect(page.getByText('This reset link is missing its token.')).toBeVisible();
    await expect(page.getByLabel('New password')).toHaveCount(0);
  });

  test('rejects a reset token that was never issued', async ({ page }) => {
    await page.goto('/reset-password?token=not-a-real-token');

    await page.getByLabel('New password').fill('a-brand-new-password');
    await page.getByRole('button', { name: 'Set new password' }).click();

    await expect(page.getByRole('alert')).toContainText('invalid or has expired');
  });
});
