import { expect, test, type Page } from '@playwright/test';

const PEOPLE = ['Simba', 'Nala', 'Timon', 'Pumbaa', 'Rafiki', 'Zazu'];

async function createExchange(page: Page) {
  await page.goto('./');
  await page.getByRole('link', { name: /Create your first exchange/ }).click();
  await page.getByLabel('Gift budget').fill('50');
  await page.getByRole('radio', { name: /Mystery Present/ }).click();
  await page.getByRole('button', { name: 'Create & add participants' }).click();
  await expect(page.getByRole('heading', { name: /Participants \(0\)/ })).toBeVisible();
  await page.getByRole('button', { name: /Bulk add/ }).click();
  await page.getByLabel('One name per line').fill(PEOPLE.join('\n'));
  await page.getByRole('button', { name: 'Preview' }).click();
  await page.getByRole('button', { name: 'Add to exchange' }).click();
  await expect(page.getByRole('heading', { name: `Participants (${PEOPLE.length})` })).toBeVisible();
}

test('organiser creates, draws, confirms and distributes; links open in a fresh browser', async ({ page, browser }) => {
  await createExchange(page);
  await page.screenshot({ path: 'screenshots/participants.png', fullPage: true });

  // Partner relationship
  await page.getByRole('link', { name: /Relationships/ }).first().click();
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add' }) }).first();
  await form.getByLabel('Person', { exact: true }).selectOption({ label: 'Simba' });
  await form.getByLabel('Other person').selectOption({ label: 'Nala' });
  await form.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('Simba & Nala are partners')).toBeVisible();

  // Rules: no swaps, matrix explanation
  await page.getByRole('link', { name: /Rules/ }).first().click();
  await page.getByRole('switch', { name: /Don’t let two people draw each other/ }).click();
  await page.getByRole('button', { name: 'Simba to Nala: Relationship restriction' }).click();
  await expect(page.getByText(/Simba can't buy for Nala: Nala is excluded by the partner relationship/)).toBeVisible();
  await page.screenshot({ path: 'screenshots/rules.png', fullPage: true });

  // Draw
  await page.getByRole('link', { name: /Draw & confirm/ }).first().click();
  await page.getByRole('button', { name: 'Generate draw' }).click();
  await expect(page.getByRole('heading', { name: 'Review the draw' })).toBeVisible();
  await expect(page.getByText(/Valid: everyone gives one gift/)).toBeVisible();
  await page.screenshot({ path: 'screenshots/review.png', fullPage: true });
  await page.getByRole('button', { name: 'Confirm this draw' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm draw' }).click();

  // Share
  await expect(page.getByRole('heading', { name: /Personal links · Draw v1/ })).toBeVisible();
  await page.getByRole('button', { name: /Create 6 links/ }).click();
  await expect(page.getByRole('link', { name: 'Preview' })).toHaveCount(6);
  await page.screenshot({ path: 'screenshots/share.png', fullPage: true });
  const links = await page.getByRole('link', { name: 'Preview' }).evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href));
  for (const l of links) {
    const u = new URL(l);
    expect(u.pathname).toBe('/secret-santa/');
    expect(u.search).toBe('');
    expect(u.hash).toMatch(/^#r=2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  }
  await page.getByRole('checkbox', { name: 'Shared' }).first().click();
  await expect(page.getByText('1 of 6 marked as shared')).toBeVisible();

  // Open every link in a brand-new context (no organiser storage) and collect assignments
  const ctx = await browser.newContext();
  const seen = new Map<string, string>();
  for (const l of links) {
    const p = await ctx.newPage();
    await p.goto(l);
    // Codenames are on by default: "Welcome back, <codename>." + "(That’s you, <name>.)"
    const intro = await p.getByText(/That’s you, /).innerText();
    const who = intro.match(/That’s you, (.+?)\.\)/)?.[1];
    expect(PEOPLE).toContain(who);
    await p.getByTestId('reveal-trigger').click();
    const recipient = (await p.getByTestId('recipient-name').innerText()).trim();
    const footer = await p.getByText(/Draw Version 1/).innerText();
    expect(footer).toContain('Family Christmas');
    // Refresh: same assignment, no new draw
    await p.reload();
    await p.getByTestId('reveal-trigger').click();
    expect((await p.getByTestId('recipient-name').innerText()).trim()).toBe(recipient);
    seen.set(who!, recipient);
    await p.close();
  }
  await ctx.close();
  expect(seen.size).toBe(6);
  expect(new Set(seen.values()).size).toBe(6);
  for (const [g, r] of seen) {
    expect(g).not.toBe(r);
    expect(seen.get(r)).not.toBe(g); // no swaps
  }
  expect(seen.get('Simba')).not.toBe('Nala');
  expect(seen.get('Nala')).not.toBe('Simba');

  // Versions page shows the fingerprint
  await page.getByRole('link', { name: /Draw versions/ }).click();
  await expect(page.getByText(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/)).toBeVisible();

  // Redraw after sharing shows the distribution warning and requires typing REDRAW
  await page.getByRole('link', { name: /Draw & confirm/ }).first().click();
  await page.getByRole('button', { name: /Start a redraw/ }).click();
  await expect(page.getByRole('dialog').getByText(/already been marked as shared with 1 participant/)).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  // Data survives reload (IndexedDB)
  await page.reload();
  await expect(page.getByText(/Draw version 1 is confirmed/)).toBeVisible();
});

test('impossible rules produce explanations and tested fixes', async ({ page }) => {
  await createExchange(page);
  await page.getByRole('link', { name: /Relationships/ }).first().click();
  await page.getByRole('button', { name: /New household/ }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Name', { exact: true }).fill('Pride Rock');
  for (const n of ['Simba', 'Nala', 'Timon', 'Pumbaa']) await dlg.getByLabel(n).check();
  await dlg.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('link', { name: /Draw & confirm/ }).first().click();
  await page.getByRole('button', { name: 'Generate draw' }).click();
  await expect(page.getByText(/4 participants belong to Pride Rock/)).toBeVisible();
  await expect(page.getByText(/only 2 eligible recipients/)).toBeVisible();
  await page.screenshot({ path: 'screenshots/diagnosis.png', fullPage: true });
  await page.getByRole('button', { name: /Review & apply/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apply change' }).click();
  await expect(page.getByText('Rules updated')).toBeVisible();
  await page.getByRole('button', { name: 'Generate draw' }).click();
  await expect(page.getByRole('heading', { name: 'Review the draw' })).toBeVisible();
});

test('direct organiser deep links survive refresh on the sub-path', async ({ page }) => {
  await page.goto('./#/help');
  await page.reload();
  await expect(page.getByRole('heading', { name: /Privacy, security & help/ })).toBeVisible();
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("default-src 'self'");
});
