import { expect, test } from '@playwright/test';
import { createRevealLink } from '../../src/services/revealLinks';
import type { RevealPayload } from '../../src/types/reveal';
import type { ThemeId } from '../../src/types/models';

/**
 * Reveal-page tests use links generated with the app's own encryption code (in Node), then
 * opened in a fresh browser — proving links work with no organiser storage at all.
 */
const BASE = 'http://localhost:4173/secret-santa/';

function payload(th: ThemeId, recipient = 'Nala', extra: Partial<RevealPayload> = {}): RevealPayload {
  return {
    v: 1,
    eid: 'ev_test',
    did: 'dr_test',
    dv: 2,
    iss: 1,
    gid: 'p_simba',
    g: 'Simba',
    gc: 'Agent Snowflake',
    r: recipient,
    en: 'Family Christmas 2026',
    yr: 2026,
    th,
    greet: 'See you all on Christmas Eve!',
    date: '2026-12-24',
    bud: 50,
    cur: 'AUD',
    loc: "Grandma's house",
    wl: { interests: 'Books & tea', links: ['https://example.com/teapot'] },
    at: new Date().toISOString(),
    ...extra,
  };
}

const THEMES: ThemeId[] = ['classic', 'present', 'advent', 'elegant'];

for (const th of THEMES) {
  test(`theme ${th}: welcome, interactive reveal, details`, async ({ page }, info) => {
    const link = await createRevealLink(payload(th), BASE);
    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'Welcome back, Agent Snowflake.' })).toBeVisible();
    await expect(page.getByText(/Your Christmas mission is ready/)).toBeVisible();
    // Not revealed before interaction
    await expect(page.getByTestId('recipient-name')).toHaveCount(0);
    await expect(page).toHaveTitle('Family Christmas 2026 · Secret Santa');
    await page.screenshot({ path: `screenshots/${th}-${info.project.name}-sealed.png` });
    await page.getByTestId('reveal-trigger').click();
    await expect(page.getByTestId('recipient-name')).toHaveText('Nala');
    await expect(page.getByText('Family Christmas 2026 — Draw Version 2 · Link #1')).toBeVisible();
    await expect(page.getByText('Books & tea')).toBeVisible();
    await expect(page.getByRole('link', { name: 'example.com' })).toHaveAttribute('rel', /noopener/);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `screenshots/${th}-${info.project.name}-revealed.png`, fullPage: true });
  });
}

test('keyboard: reveal object is focusable and opens with Enter', async ({ page }) => {
  await page.goto(await createRevealLink(payload('advent'), BASE));
  const trigger = page.getByTestId('reveal-trigger');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('recipient-name')).toHaveText('Nala');
  await expect(page.getByTestId('revealed-card')).toBeFocused();
});

test('reduced motion: reveals immediately without the opening animation', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(await createRevealLink(payload('present'), BASE));
  await page.getByTestId('reveal-trigger').click();
  // No animation phase: the card is present right away
  await expect(page.getByTestId('recipient-name')).toHaveText('Nala', { timeout: 300 });
  await ctx.close();
});

test('long names stay legible and do not overflow', async ({ page }, info) => {
  const long = 'Maximilian-Alexander Bartholomew Featherstonehaugh-Montgomery';
  await page.goto(await createRevealLink(payload('classic', long), BASE));
  await page.getByTestId('reveal-trigger').click();
  const name = page.getByTestId('recipient-name');
  await expect(name).toHaveText(long);
  await expect(name).toHaveAttribute('data-len', 'xlong');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `screenshots/longname-${info.project.name}.png`, fullPage: true });
});

test('card can be saved as an image without the link or key', async ({ page }) => {
  await page.goto(await createRevealLink(payload('elegant'), BASE));
  await page.getByTestId('reveal-trigger').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Save card as image/ }).click()]);
  expect(download.suggestedFilename()).toBe('secret-santa-family-christmas-2026.png');
  const path = await download.path();
  expect(path).toBeTruthy();
});

test('corrupted, truncated and tampered links show a friendly error', async ({ page }) => {
  const link = await createRevealLink(payload('classic'), BASE);
  const [base, frag] = link.split('#');
  const [ver, ct, key] = frag!.slice(2).split('.');
  for (const bad of [`#r=${ver}.${ct!.slice(0, 20)}.${key}`, `#r=${ver}.${ct}.${key!.slice(0, 30)}`, `#r=${ver}.${ct!.slice(0, -4)}AAAA.${key}`, '#r=garbage']) {
    await page.goto(`${base}${bad}`);
    await expect(page.getByRole('heading', { name: 'Oh, tinsel!' })).toBeVisible();
    await expect(page.getByTestId('recipient-name')).toHaveCount(0);
  }
});

test('anonymous question flow on the reveal page produces an encrypted packet', async ({ page }) => {
  const { generateRelayKeyPair } = await import('../../src/services/cryptography');
  const keys = await generateRelayKeyPair();
  await page.goto(await createRevealLink(payload('present', 'Nala', { rk: keys.publicKeyJwk }), BASE));
  await page.getByTestId('reveal-trigger').click();
  await page.getByLabel('Your question').fill('What books do you like?');
  await page.getByRole('button', { name: 'Create question message' }).click();
  const packet = await page.getByLabel('Encrypted message to send').inputValue();
  expect(packet).toMatch(/^SECRET-SANTA-PACKET:1:/);
  expect(packet).not.toContain('books');
  const { decryptWithPrivateKey } = await import('../../src/services/cryptography');
  const opened = (await decryptWithPrivateKey(keys.privateKeyJwk, packet)) as { text: string; gid: string };
  expect(opened.text).toBe('What books do you like?');
  // Checklist persists locally
  await page.getByLabel('Gift purchased').check();
  await page.reload();
  await page.getByTestId('reveal-trigger').click();
  await expect(page.getByLabel('Gift purchased')).toBeChecked();
});
