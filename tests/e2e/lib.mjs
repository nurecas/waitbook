// Shared helpers for browser tests.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const FIX = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

/** Serve the live APIs from fixtures, so tests never touch the network. */
export async function mockLiveApis(ctx) {
  const feed = await readFile(join(FIX, 'opds-sample.xml'), 'utf8');
  const head = feed.split('<entry>')[0];
  const entries = feed.split('<entry>').slice(1).map((e) => '<entry>' + e.split('</entry>')[0] + '</entry>');
  await ctx.route('https://opds.library.kiwix.org/**', (route) => {
    const u = new URL(route.request().url());
    const name = u.searchParams.get('name');
    const q = (u.searchParams.get('q') || '').toLowerCase();
    const hits = entries.filter((e) => (!name || e.includes('<name>' + name + '</name>')) && (!q || e.toLowerCase().includes(q)));
    const body = head.replace(/<totalResults>\d+/, '<totalResults>' + hits.length) + hits.join('\n') + '\n</feed>';
    route.fulfill({ status: 200, contentType: 'application/atom+xml', headers: { 'access-control-allow-origin': '*' }, body });
  });
  await ctx.route('https://huggingface.co/**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: await readFile(join(FIX, 'hf-tree.json'), 'utf8') }));
}

/** Pack a kit through the real wizard so kit screens have content. */
export async function seedKit(page, base, settings) {
  await page.goto(base + '#/');
  await page.evaluate((s) => { localStorage.setItem('wb.settings.v1', JSON.stringify(s)); localStorage.removeItem('wb.draft.v1'); }, settings || {});
  await page.reload(); // settings are read at start-up; a hash change alone would keep the old ones
  await page.goto(base + '#/pack?step=4');
  await page.waitForTimeout(400);
  await page.locator('main button.btn-primary').first().click();
  await page.waitForTimeout(300);
}
