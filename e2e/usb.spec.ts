import { expect, test } from '@playwright/test';
import { collectConsoleErrors, readMeasurement } from './helpers';

/**
 * USB audio / Sabrent mode, exercised with Chromium's FAKE audio device.
 * The physical Sabrent AU-UCMA + iPhone combination is NOT tested here:
 * device labels are mocked to simulate what a browser might report.
 */
const TAB = 'USB audio / Sabrent';

test.describe('USB audio / Sabrent input mode (simulated devices)', () => {
  test('shows the connection flow and never claims the adapter without a recognisable label', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    await page.getByRole('tab', { name: TAB }).click();
    await expect(page.locator('.source-badge')).toContainText('USB AUDIO');
    await expect(page.locator('.source-badge')).toContainText('not connected');
    await expect(page.getByText(/pink\/purple microphone socket/)).toBeVisible();
    await expect(page.locator('#tabpanel-external').getByText('This microphone input is not a general-purpose voltage probe.')).toBeVisible();
    await expect(page.locator('.steps li')).toHaveCount(4);
    await page.getByRole('button', { name: 'Connect USB input' }).click();
    await expect(page.locator('#live-status')).toContainText('Connected', { timeout: 15000 });
    // Chromium's fake device is labelled "Fake Default Audio Input": not recognisable as an adapter.
    await expect(page.locator('#live-status')).toContainText('System-selected input — external adapter not confirmed');
    await expect(page.locator('.source-badge')).toContainText('System-selected input — external adapter not confirmed');
    await expect(page.locator('.source-badge')).toContainText('live · unverified');
    await expect(page.locator('#identity-line')).toContainText('External adapter not confirmed');
    await expect(page.locator('body')).not.toContainText(/Sabrent connected/i);
    // Level meter and diagnostics
    await expect(page.getByRole('meter')).toBeVisible();
    await expect.poll(async () => parseFloat(await readMeasurement(page, 'Peak-to-peak')), { timeout: 15000 }).toBeGreaterThan(0.001);
    await page.locator('#diagnostics summary').click();
    const diag = page.locator('#diagnostics');
    await expect(diag).toContainText('Input label');
    await expect(diag).toContainText('Fake Default Audio Input');
    await expect(diag).toContainText('Source identity');
    await expect(diag).toContainText('unverified');
    await expect(diag).toContainText(/Processing sample rate \(AudioContext\)\s*\d+ Hz — analysis uses this/);
    await expect(diag).toContainText(/AudioContext state\s*running/);
    await expect(diag).toContainText('Channel count');
    await expect(diag).toContainText('Auto gain control');
    await expect(diag).toContainText('Digital clipping');
    // Demo playback must not be running in this mode
    await expect(page.getByRole('button', { name: 'Stop sound' })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('recognises a USB-labelled input and reports it honestly as recognised-by-label', async ({ page }) => {
    await page.addInitScript(() => {
      const md = navigator.mediaDevices;
      const origEnum = md.enumerateDevices.bind(md);
      md.enumerateDevices = async () => (await origEnum()).map((d) => (d.kind === 'audioinput' ? ({ deviceId: d.deviceId, groupId: d.groupId, kind: d.kind, label: d.label ? 'USB Audio Device' : '', toJSON: () => ({}) } as MediaDeviceInfo) : d));
      const origGum = md.getUserMedia.bind(md);
      md.getUserMedia = async (c) => {
        const s = await origGum(c);
        for (const t of s.getAudioTracks()) Object.defineProperty(t, 'label', { value: 'USB Audio Device', configurable: true });
        return s;
      };
    });
    await page.goto('/');
    await page.getByRole('tab', { name: TAB }).click();
    await page.getByRole('button', { name: 'Connect USB input' }).click();
    await expect(page.locator('#live-status')).toContainText('Connected: USB Audio Device', { timeout: 15000 });
    await expect(page.locator('.source-badge')).toContainText('live · external');
    await expect(page.locator('#identity-line')).toContainText('External adapter recognised by label');
    await expect(page.locator('#identity-line')).toContainText('cannot confirm the exact model');
    await expect(page.locator('body')).not.toContainText(/Sabrent connected/i);
    await expect(page.getByLabel('Input device')).toContainText('likely USB/external');
  });

  test('reconnect / rescan switches to an adapter that appeared after capture started', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __usbLabel: string };
      w.__usbLabel = '';
      const md = navigator.mediaDevices;
      const origEnum = md.enumerateDevices.bind(md);
      md.enumerateDevices = async () => (await origEnum()).map((d) => (d.kind === 'audioinput' && w.__usbLabel ? ({ deviceId: d.deviceId, groupId: d.groupId, kind: d.kind, label: w.__usbLabel, toJSON: () => ({}) } as MediaDeviceInfo) : d));
      const origGum = md.getUserMedia.bind(md);
      md.getUserMedia = async (c) => {
        const s = await origGum(c);
        if (w.__usbLabel) for (const t of s.getAudioTracks()) Object.defineProperty(t, 'label', { value: w.__usbLabel, configurable: true });
        return s;
      };
    });
    await page.goto('/');
    await page.getByRole('tab', { name: TAB }).click();
    await page.getByRole('button', { name: 'Connect USB input' }).click();
    await expect(page.locator('#live-status')).toContainText('external adapter not confirmed', { timeout: 15000 });
    // "Plug in" the adapter: the browser now labels the input as USB.
    await page.evaluate(() => { (window as unknown as { __usbLabel: string }).__usbLabel = 'Sabrent USB Type-C Audio'; });
    await page.getByRole('button', { name: /Reconnect \/ rescan/ }).click();
    await expect(page.locator('#live-status')).toContainText('Connected: Sabrent USB Type-C Audio', { timeout: 15000 });
    await expect(page.locator('.source-badge')).toContainText('live · external');
  });

  test('muted, unmuted and ended tracks are flagged, never silently replaced', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.addInitScript(() => {
      const md = navigator.mediaDevices;
      const origGum = md.getUserMedia.bind(md);
      md.getUserMedia = async (c) => {
        const s = await origGum(c);
        (window as unknown as { __stream: MediaStream }).__stream = s;
        return s;
      };
    });
    await page.goto('/');
    await page.getByRole('tab', { name: TAB }).click();
    await page.getByRole('button', { name: 'Connect USB input' }).click();
    await expect(page.locator('#live-status')).toContainText('Connected', { timeout: 15000 });
    const fire = (name: string) => page.evaluate((n) => { (window as unknown as { __stream: MediaStream }).__stream.getAudioTracks()[0].dispatchEvent(new Event(n)); }, name);
    await fire('mute');
    await expect(page.locator('#live-status')).toContainText('Paused');
    await expect(page.locator('#live-status')).toContainText('no samples are being shown');
    await expect(page.locator('.source-badge')).toContainText('paused');
    await expect(page.getByRole('meter')).toHaveAttribute('aria-valuetext', 'no input');
    await fire('unmute');
    await expect(page.locator('#live-status')).toContainText('Connected');
    await expect(page.locator('.source-badge')).toContainText('live');
    await fire('ended');
    await expect(page.locator('#live-status')).toContainText('The input ended');
    await expect(page.locator('#live-status')).toHaveClass(/status-error/);
    await expect(page.locator('.source-badge')).toContainText('not connected');
    await expect(page.locator('.trig-state')).not.toContainText('Triggered');
    // Reconnect brings it back
    await page.getByRole('button', { name: /Reconnect \/ rescan/ }).click();
    await expect(page.locator('#live-status')).toContainText('Connected', { timeout: 15000 });
    // Switching to demo releases everything and playback stays off
    await page.getByRole('tab', { name: 'Demo signals' }).click();
    await expect(page.locator('.source-badge')).toContainText('SIMULATED');
    await expect(page.locator('.source-badge')).toContainText('silent');
    expect(errors).toEqual([]);
  });

  test('entering USB mode stops audible demo playback', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Play sound/ }).click();
    await expect(page.locator('.source-badge')).toContainText('audible', { timeout: 10000 });
    await page.getByRole('tab', { name: TAB }).click();
    await expect(page.locator('.source-badge')).toContainText('USB AUDIO');
    await page.getByRole('tab', { name: 'Demo signals' }).click();
    await expect(page.locator('.source-badge')).toContainText('silent');
  });
});
