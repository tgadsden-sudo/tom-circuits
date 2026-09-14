import { expect, type Page } from '@playwright/test';

export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

/** Read the numeric frequency shown in the Measurements panel (Hz), or NaN. */
export async function readFrequencyHz(page: Page): Promise<number> {
  const text = await page.locator('.measurements dt:has-text("Frequency") + dd').innerText();
  const m = text.match(/([\d.]+)\s*(k?)Hz/);
  if (!m) return NaN;
  return parseFloat(m[1]) * (m[2] === 'k' ? 1000 : 1);
}

export async function readMeasurement(page: Page, label: string): Promise<string> {
  return page.locator(`.measurements dt:has-text("${label}") + dd`).innerText();
}

export async function waitForFrequency(page: Page, target: number, tolerance = 0.01): Promise<number> {
  let last = NaN;
  await expect
    .poll(
      async () => {
        last = await readFrequencyHz(page);
        return Number.isFinite(last) && Math.abs(last - target) / target < tolerance;
      },
      { timeout: 15_000, message: `frequency ${last} not within ${tolerance * 100}% of ${target}` },
    )
    .toBe(true);
  return last;
}

export function parseCsv(text: string): { meta: Record<string, string>; rows: [number, number][] } {
  const meta: Record<string, string> = {};
  const rows: [number, number][] = [];
  let inData = false;
  for (const line of text.split('\n')) {
    if (!line) continue;
    if (line.startsWith('#')) {
      const idx = line.indexOf(':');
      if (idx > 0) meta[line.slice(2, idx).trim()] = line.slice(idx + 1).trim();
      continue;
    }
    if (line === 'time_s,amplitude') {
      inData = true;
      continue;
    }
    if (inData) {
      const [t, a] = line.split(',');
      rows.push([parseFloat(t), parseFloat(a)]);
    }
  }
  return { meta, rows };
}

/** Frequency from the interpolated times of rising zero crossings. */
export function zeroCrossingFrequency(rows: [number, number][]): number {
  const times: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const [t0, a] = rows[i - 1];
    const [t1, b] = rows[i];
    if (a < 0 && b >= 0) times.push(t0 + ((0 - a) / (b - a)) * (t1 - t0));
  }
  if (times.length < 2) return NaN;
  return (times.length - 1) / (times[times.length - 1] - times[0]);
}
