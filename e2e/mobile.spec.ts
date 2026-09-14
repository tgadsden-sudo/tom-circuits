import { expect, test } from '@playwright/test';
import { collectConsoleErrors, waitForFrequency } from './helpers';

test('phone layout has no horizontal overflow and uses plot tabs', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/');
  await waitForFrequency(page, 440, 0.01);
  const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(overflow.sw).toBeLessThanOrEqual(overflow.iw);
  await expect(page.getByRole('tab', { name: 'Waveform' })).toBeVisible();
  await expect(page.locator('.scope-canvas')).toBeVisible();
  await expect(page.locator('.spectrum-canvas')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Spectrum' }).click();
  await expect(page.locator('.spectrum-canvas')).toBeVisible();
  await expect(page.locator('.scope-canvas')).toHaveCount(0);
  // Every visible button is at least 40px tall (touch friendly)
  const small = await page.locator('button:visible').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 34).map((e) => e.textContent));
  expect(small).toEqual([]);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
