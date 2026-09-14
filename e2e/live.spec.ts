import { expect, test } from '@playwright/test';
import { collectConsoleErrors, readMeasurement, waitForFrequency } from './helpers';

/**
 * These tests use Chromium's FAKE microphone device
 * (--use-fake-device-for-media-stream). They verify the acquisition path
 * (getUserMedia → AudioWorklet → ring buffer → display/measurements) with
 * simulated input. They do NOT test a real microphone or the BrainBox kit.
 */
test.describe('live input with simulated (fake) microphone', () => {
  test('connect, capture, disconnect and switch modes release resources', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    await page.getByRole('tab', { name: 'Microphone' }).click();
    await page.getByRole('button', { name: 'Connect microphone' }).click();
    await expect(page.locator('#live-status')).toContainText('Connected', { timeout: 15000 });
    await expect(page.locator('.source-badge')).toContainText('MICROPHONE');
    await expect(page.locator('.source-badge')).toContainText('live');
    // The sample rate is whatever the AudioContext reports, not a hard-coded value
    const srText = await readMeasurement(page, 'Sample rate');
    const sr = parseInt(srText, 10);
    expect(sr).toBeGreaterThan(8000);
    await expect(page.locator('.plot-info')).toContainText(`${sr} Hz`);
    // Fake device produces audio: peak-to-peak becomes non-zero at some point
    await expect.poll(async () => parseFloat(await readMeasurement(page, 'Peak-to-peak')), { timeout: 15000 }).toBeGreaterThan(0.001);
    // Live tracks are active
    const tracks = await page.evaluate(() => (window as unknown as { __tracks?: number }).__tracks ?? -1);
    expect(tracks).toBe(-1); // no global leakage
    await expect(page.locator('#diagnostics summary')).toHaveText('Diagnostics');

    await page.getByRole('button', { name: 'Disconnect input' }).click();
    await expect(page.locator('#live-status')).toContainText('Input released');
    await expect(page.locator('.source-badge')).toContainText('not connected');
    await expect(page.getByRole('button', { name: 'Connect microphone' })).toBeVisible();

    // Reconnect then switch to demo: demo takes over cleanly, still one AudioContext
    await page.getByRole('button', { name: 'Connect microphone' }).click();
    await expect(page.locator('#live-status')).toContainText('Connected', { timeout: 15000 });
    await page.getByRole('tab', { name: 'Demo signals' }).click();
    await expect(page.locator('.source-badge')).toContainText('SIMULATED');
    await waitForFrequency(page, 440, 0.01);
    await expect(page.locator('.measurements dt:has-text("Sample rate") + dd')).toContainText('48000 Hz');
    expect(errors).toEqual([]);
  });

  test('cancelling a pending connection never reports a connection', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'USB audio / Sabrent' }).click();
    await expect(page.locator('.source-badge')).toContainText('USB AUDIO');
    await expect(page.locator('#tabpanel-external').getByText('This microphone input is not a general-purpose voltage probe.')).toBeVisible();
    // Slow down getUserMedia so we can cancel while it is pending
    await page.evaluate(() => {
      const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = (c) => new Promise((res, rej) => setTimeout(() => orig(c).then(res, rej), 1500));
    });
    await page.getByRole('button', { name: 'Connect USB input' }).click();
    await expect(page.locator('#live-status')).toContainText('Requesting');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('#live-status')).toContainText('cancelled');
    await page.waitForTimeout(2500);
    await expect(page.locator('#live-status')).toContainText('cancelled');
    await expect(page.locator('.source-badge')).toContainText('not connected');
  });

  test('audible demo playback is off by default, starts on click, stops on live mode', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    await expect(page.locator('.source-badge')).toContainText('silent');
    await page.getByRole('button', { name: /Play sound/ }).click();
    await expect(page.locator('.source-badge')).toContainText('audible', { timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Stop sound' })).toBeVisible();
    await expect(page.getByLabel(/Playback volume/)).toHaveValue('0.08');
    // The displayed samples are now the worklet's (context sample rate) and still measure 440 Hz
    await waitForFrequency(page, 440, 0.01);
    const sr = parseInt(await readMeasurement(page, 'Sample rate'), 10);
    expect(sr).toBeGreaterThan(8000);
    // Switching to microphone must stop playback (feedback protection)
    await page.getByRole('tab', { name: 'Microphone' }).click();
    await page.getByRole('tab', { name: 'Demo signals' }).click();
    await expect(page.locator('.source-badge')).toContainText('silent');
    await expect(page.getByRole('button', { name: /Play sound/ })).toBeVisible();
    // Stop button works too
    await page.getByRole('button', { name: /Play sound/ }).click();
    await expect(page.getByRole('button', { name: 'Stop sound' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop sound' }).click();
    await expect(page.locator('.source-badge')).toContainText('silent');
    await waitForFrequency(page, 440, 0.01);
    expect(errors).toEqual([]);
  });
});
