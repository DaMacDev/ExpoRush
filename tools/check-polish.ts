/**
 * B5 polish check against the production build (`npm run build` first):
 * no horizontal overflow at 360/768/1280 px and a visible focus ring after Tab.
 * Starts `vite preview` itself and stops it by PID.
 *
 * Usage: npm run check:polish
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const URL = 'http://localhost:5174/ExpoRush/';

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

/** Kill the server's PID tree (Windows-first; plain kill elsewhere or on failure). */
async function stop(server: ChildProcess): Promise<void> {
  if (process.platform === 'win32' && server.pid) {
    const code = await new Promise<number | null>((res) => {
      const k = spawn('taskkill', ['/T', '/F', '/PID', String(server.pid)], { stdio: 'ignore' });
      k.on('error', () => res(null));
      k.on('exit', res);
    });
    if (code === 0) return;
  }
  server.kill();
}

async function main(): Promise<void> {
  const server = spawn('npx vite preview --base /ExpoRush/ --port 5174 --strictPort', { shell: true, stdio: 'ignore' });
  const failures: string[] = [];
  const html = readFileSync('dist/index.html', 'utf8');
  for (const q of ['prefers-color-scheme', 'prefers-reduced-motion']) {
    if (!html.includes(q)) failures.push(`dist/index.html lacks ${q}`);
  }
  try {
    await waitUp();
    const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu'] });
    for (const width of [360, 768, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.goto(URL, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('button', { timeout: 30000 });
      // html/body are overflow:hidden, so documentElement.scrollWidth proves nothing;
      // measure the UI itself instead.
      const m = await page.evaluate(() => {
        const iw = window.innerWidth;
        const bad: string[] = [];
        const ui = [...document.querySelectorAll<HTMLElement>('.laas-ui')];
        const roots = ui.filter((e) => !e.parentElement?.closest('.laas-ui'));
        for (const root of roots) {
          if (root.scrollWidth > root.clientWidth) bad.push(`root scrollWidth ${root.scrollWidth} > clientWidth ${root.clientWidth}`);
        }
        let checked = 0;
        for (const root of roots) {
          for (const e of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
            if (e.closest('[aria-hidden="true"]')) continue; // decorative parallax backdrop is intentionally wider than the viewport
            const r = e.getBoundingClientRect();
            if (r.width === 0 || r.height === 0 || getComputedStyle(e).visibility === 'hidden') continue;
            checked++;
            if (r.right > iw + 0.5 || r.left < -0.5) {
              bad.push(`${e.tagName}.${String(e.className).slice(0, 40)} left ${r.left} right ${r.right}`);
            }
          }
        }
        return { iw, bad: bad.slice(0, 5), checked };
      });
      if (m.checked === 0) failures.push(`no visible .laas-ui elements at ${width}`);
      for (const b of m.bad) failures.push(`overflow at ${width}: ${b}`);

      await page.keyboard.press('Tab');
      const ring = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          style: cs.outlineStyle,
          width: parseFloat(cs.outlineWidth),
          inside: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
        };
      });
      if (!ring || ring.style === 'none' || ring.width <= 0) {
        failures.push(`no visible focus ring after Tab at ${width}: ${JSON.stringify(ring)}`);
      } else if (!ring.inside) {
        failures.push(`focused element outside viewport at ${width}`);
      }

      // Enter the world so the canvas exists, then it must fill the viewport.
      await page.evaluate(() => {
        [...document.querySelectorAll('button')].find((b) => /solo/i.test(b.textContent ?? ''))?.click();
      });
      const canvasW = await page
        .waitForSelector('canvas', { timeout: 60000 })
        .then(() => page.evaluate(() => document.querySelector('canvas')?.clientWidth ?? null))
        .catch(() => null);
      if (canvasW !== m.iw) failures.push(`canvas clientWidth ${canvasW} != innerWidth ${m.iw} at ${width}`);
      await page.close();
    }
    await browser.close();
  } finally {
    await stop(server);
  }
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('check:polish OK (UI within viewport at 360/768/1280, focus ring visible, media queries shipped)');
}

void main();
