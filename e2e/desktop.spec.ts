import { expect, test } from '@playwright/test';
import { collectConsoleErrors, parseCsv, readMeasurement, waitForFrequency, zeroCrossingFrequency } from './helpers';

test.describe('Wave Lab desktop (demo mode, no permissions)', () => {
  test('opens on a working demo waveform with correct measurements', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Wave Lab' })).toBeVisible();
    await expect(page.locator('.source-badge')).toContainText('SIMULATED');
    await expect(page.locator('.source-badge')).toContainText('sine 440 Hz');
    const f = await waitForFrequency(page, 440, 0.005);
    expect(f).toBeGreaterThan(437);
    const rms = parseFloat(await readMeasurement(page, 'RMS amplitude'));
    expect(rms).toBeCloseTo(0.6 / Math.SQRT2, 2);
    const p2p = parseFloat(await readMeasurement(page, 'Peak-to-peak'));
    expect(Math.abs(p2p - 1.2)).toBeLessThan(0.02);
    await expect(page.locator('dt:has-text("Sample rate") + dd')).toContainText('48000 Hz');
    await expect(page.locator('dt:has-text("Input clipping") + dd').first()).toHaveText('no');
    await expect(page.locator('.trig-state')).toContainText('Triggered');
    // canvas actually has trace pixels (not blank)
    const painted = await page.locator('.scope-canvas').evaluate((c: HTMLCanvasElement) => {
      const ctx = c.getContext('2d')!;
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let cyan = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 1] > 180 && d[i + 2] > 150 && d[i] < 120) cyan++;
      return cyan;
    });
    expect(painted).toBeGreaterThan(500);
    expect(errors).toEqual([]);
  });

  test('demo controls change the real signal; gain changes display only', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    await page.getByLabel('Waveform').selectOption('square');
    await page.getByLabel('Frequency value').fill('300');
    await waitForFrequency(page, 300, 0.01);
    await expect(page.locator('.source-badge')).toContainText('square 300 Hz');
    // Square wave at 0.6 amplitude → RMS ≈ 0.6 (band-limited, slightly less)
    const rms = parseFloat(await readMeasurement(page, 'RMS amplitude'));
    expect(rms).toBeGreaterThan(0.55);
    expect(rms).toBeLessThan(0.62);
    // Spectrum peak equals fundamental for a 50% square
    await expect.poll(async () => readMeasurement(page, 'Dominant spectral peak')).toContain('300');
    // Change gain: measurements unchanged, and display-clipping note appears (not input clipping)
    await page.getByLabel('Display gain').selectOption('10');
    await page.waitForTimeout(400);
    const rms2 = parseFloat(await readMeasurement(page, 'RMS amplitude'));
    expect(Math.abs(rms2 - rms)).toBeLessThan(0.01);
    await expect(page.locator('dt:has-text("Input clipping") + dd').first()).toHaveText('no');
    await expect(page.locator('.plot-info')).toContainText('gain ×10');
    // Noise: no confident pitch
    await page.getByLabel('Waveform').selectOption('noise');
    await expect.poll(async () => (await page.locator('dt:has-text("Frequency") + dd').innerText()).trim(), { timeout: 8000 }).toBe('—');
    await expect(page.locator('dt:has-text("Frequency") + dd + dd')).toContainText('no clear repeating pattern');
    // Siren: unstable rather than a fake stable number
    await page.getByLabel('Waveform').selectOption('siren');
    await expect.poll(async () => (await page.locator('dt:has-text("Frequency") + dd').innerText()).trim(), { timeout: 8000 }).toBe('unstable');
    // Amplitude 0 → silence
    await page.getByLabel('Waveform').selectOption('sine');
    await page.getByLabel(/^Amplitude/).fill('0');
    await expect(page.locator('dt:has-text("Frequency") + dd + dd')).toContainText('insufficient signal', { timeout: 8000 });
    expect(errors).toEqual([]);
  });

  test('trigger states are honest: no crossing, waiting, and free-running', async ({ page }) => {
    await page.goto('/');
    await waitForFrequency(page, 440, 0.01);
    await page.getByLabel(/Trigger level/).fill('0.9');
    await expect(page.locator('.trig-state')).toContainText('No crossing found', { timeout: 5000 });
    await page.getByLabel(/Trigger level/).fill('0.1');
    await expect(page.locator('.trig-state')).toContainText('Triggered');
    await page.getByLabel('Trigger', { exact: true }).selectOption('falling');
    await expect(page.locator('.trig-state')).toContainText('falling edge');
    await page.getByLabel('Trigger', { exact: true }).selectOption('free');
    await expect(page.locator('.trig-state')).toContainText('Free-running');
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.locator('.trig-state')).toContainText('Triggered (rising edge)');
    await expect(page.getByLabel('Display gain')).toHaveValue('1');
  });

  test('freeze, single capture, CSV export with correct timing, PNG export, reference trace', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    await waitForFrequency(page, 440, 0.01);
    await expect(page.getByRole('button', { name: '⬇ CSV' })).toBeDisabled();
    await page.getByRole('button', { name: 'Freeze' }).click();
    await expect(page.locator('.trig-state')).toHaveText(/Frozen/);
    await expect(page.getByRole('button', { name: 'Run' })).toBeVisible();
    await expect(page.locator('#meas-heading')).toContainText('frozen capture');

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '⬇ CSV' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^wavelab-demo-.*\.csv$/);
    const text = await (await download.createReadStream()).toArray().then((b) => Buffer.concat(b).toString('utf8'));
    const { meta, rows } = parseCsv(text);
    expect(meta['source']).toBe('demo');
    expect(meta['sample_rate_hz']).toBe('48000');
    expect(meta['trigger_mode']).toBe('rising');
    expect(meta['amplitude_units']).toContain('not volts');
    // 2 ms/div × 10 div × 48000 Hz = 960 samples
    expect(rows).toHaveLength(960);
    expect(rows[0][0]).toBe(0);
    expect(rows[1][0]).toBeCloseTo(1 / 48000, 9);
    expect(rows[959][0]).toBeCloseTo(959 / 48000, 8);
    const fz = zeroCrossingFrequency(rows);
    expect(Math.abs(fz - 440) / 440).toBeLessThan(0.005);
    let peak = 0;
    for (const [, a] of rows) peak = Math.max(peak, Math.abs(a));
    expect(peak).toBeGreaterThan(0.58);
    expect(peak).toBeLessThanOrEqual(0.6001);
    // trigger index = pre-trigger = 10% of window
    expect(meta['trigger_sample_index']).toBe('96');
    // and the sample at the trigger is a rising zero crossing
    expect(rows[95][1]).toBeLessThan(0);
    expect(rows[96][1]).toBeGreaterThanOrEqual(0);

    // Zooming while frozen keeps frozen data and changes the export length
    await page.getByLabel('Time / division').selectOption('0.001');
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '⬇ CSV' }).click()]);
    const text2 = await (await dl2.createReadStream()).toArray().then((b) => Buffer.concat(b).toString('utf8'));
    expect(parseCsv(text2).rows).toHaveLength(480);

    // PNG
    const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '⬇ PNG' }).click()]);
    const buf = Buffer.concat(await (await png.createReadStream()).toArray());
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(buf.length).toBeGreaterThan(5000);

    // Reference + run again
    await page.getByRole('button', { name: 'Keep as reference' }).click();
    await expect(page.getByRole('button', { name: 'Clear reference' })).toBeVisible();
    await page.getByRole('button', { name: 'Run' }).click();
    await expect(page.locator('.trig-state')).toContainText('Triggered');

    // Single: with an impossible level it stays armed; lowering the level captures and freezes
    await page.getByLabel(/Trigger level/).fill('0.95');
    await page.getByRole('button', { name: 'Single' }).click();
    await expect(page.locator('.trig-state')).toContainText('armed');
    await page.waitForTimeout(600);
    await expect(page.locator('.trig-state')).toContainText('armed');
    await page.getByLabel(/Trigger level/).fill('0');
    await expect(page.locator('.trig-state')).toHaveText(/Frozen/, { timeout: 3000 });
    await expect(page.getByRole('button', { name: '⬇ CSV' })).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test('auto-scale picks a sensible gain and time base', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/^Amplitude/).fill('0.1');
    await waitForFrequency(page, 440, 0.01);
    await page.getByRole('button', { name: 'Auto-scale' }).click();
    await expect(page.getByLabel('Display gain')).toHaveValue('5');
    await expect(page.getByLabel('Time / division')).toHaveValue('0.0005');
  });

  test('missing input device is reported honestly', async ({ page, context }) => {
    // Headless Chromium without a fake device has no audio input at all.
    await context.clearPermissions();
    await page.goto('/');
    await page.getByRole('tab', { name: 'Microphone' }).click();
    await page.getByRole('button', { name: 'Connect microphone' }).click();
    await expect(page.locator('#live-status')).toContainText('No audio input device was found', { timeout: 10000 });
    await expect(page.locator('.source-badge')).toContainText('not connected');
  });

  test('microphone permission denied leaves an honest, usable UI', async ({ page, context }) => {
    const errors = collectConsoleErrors(page);
    await context.clearPermissions();
    // Simulate the user pressing "Block" on the permission prompt.
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    });
    await page.goto('/');
    await page.getByRole('tab', { name: 'Microphone' }).click();
    await expect(page.locator('.source-badge')).toContainText('MICROPHONE');
    await expect(page.locator('.source-badge')).toContainText('not connected');
    await expect(page.locator('#live-status')).toContainText('Not connected');
    await page.getByRole('button', { name: 'Connect microphone' }).click();
    await expect(page.locator('#live-status')).toContainText(/denied|blocked/i, { timeout: 10000 });
    await expect(page.locator('#live-status')).toHaveClass(/status-error/);
    await expect(page.locator('.source-badge')).toContainText('not connected');
    // No simulated data is substituted: frequency stays blank
    await page.waitForTimeout(500);
    await expect(page.locator('.trig-state')).not.toContainText('Triggered');
    // Demo still works afterwards
    await page.getByRole('tab', { name: 'Demo signals' }).click();
    await expect(page.locator('.source-badge')).toContainText('SIMULATED');
    await waitForFrequency(page, 440, 0.01);
    expect(errors.filter((e) => !/getUserMedia|Permission|NotAllowed/i.test(e))).toEqual([]);
  });

  test('try-this setups configure the app without requesting permission', async ({ page }) => {
    await page.goto('/');
    await page.locator('summary', { hasText: 'Compare sine, square' }).click();
    await page.getByRole('button', { name: 'Set up demo square wave' }).click();
    await expect(page.locator('.source-badge')).toContainText('square 300 Hz');
    await expect(page.getByLabel('Time / division')).toHaveValue('0.001');
    await page.locator('summary', { hasText: 'Hum a low note' }).click();
    await page.getByRole('button', { name: 'Set up scope (then Connect yourself)' }).first().click();
    await expect(page.getByRole('tab', { name: 'Microphone' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.source-badge')).toContainText('not connected');
    await expect(page.getByRole('button', { name: 'Connect microphone' })).toBeVisible();
  });

  test('keyboard focus is visible and controls are labelled', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel('Waveform')).toBeVisible();
    await expect(page.getByLabel('Time / division')).toBeVisible();
    await expect(page.getByLabel('Display gain')).toBeVisible();
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(['BUTTON', 'SELECT', 'INPUT', 'A']).toContain(focused);
    // Space toggles run/freeze when focus is on the body
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Space');
    await expect(page.locator('.trig-state')).toHaveText(/Frozen/);
    await page.keyboard.press('Space');
    await expect(page.locator('.trig-state')).toContainText('Triggered');
  });
});
