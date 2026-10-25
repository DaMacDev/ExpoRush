/**
 * B5 polish check against the production build (`npm run build` first):
 * no horizontal overflow at 360/768/1280 px and a visible focus ring after Tab.
 * Starts `vite preview` itself and stops it by PID.
 *
 * Usage: npm run check:polish
 */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const URL = 'http://localhost:5174/minecraft3d/';

async function waitUp(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(URL)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}

async function main(): Promise<void> {
  const server = spawn('npx vite preview --base /minecraft3d/ --port 5174 --strictPort', { shell: true, stdio: 'ignore' });
  const failures: string[] = [];
  try {
    await waitUp();
    const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu'] });
    for (const width of [360, 768, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.goto(URL, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('button', { timeout: 30000 });
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        iw: window.innerWidth,
      }));
      if (m.sw > m.iw) failures.push(`overflow at ${width}: scrollWidth ${m.sw} > ${m.iw}`);
      if (width === 1280) {
        await page.keyboard.press('Tab');
        const ring = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const cs = getComputedStyle(el);
          return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
        });
        if (!ring || ring.style === 'none' || ring.width <= 0) {
          failures.push(`no visible focus ring after Tab: ${JSON.stringify(ring)}`);
        }
      }
      await page.close();
    }
    await browser.close();
  } finally {
    spawn(`taskkill /T /F /PID ${server.pid}`, { shell: true, stdio: 'ignore' });
  }
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('check:polish OK (no overflow at 360/768/1280, focus ring visible)');
}

void main();
