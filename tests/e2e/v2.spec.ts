import { expect, test, type Browser, type Page } from '@playwright/test';

const PEOPLE = ['Simba', 'Nala', 'Timon', 'Pumbaa', 'Rafiki'];

async function setupConfirmedWithLinks(page: Page) {
  await page.goto('./');
  await page.getByRole('link', { name: /Create your first exchange/ }).click();
  await page.getByRole('button', { name: 'Create & add participants' }).click();
  await page.getByRole('button', { name: /Bulk add/ }).click();
  await page.getByLabel('One name per line').fill(PEOPLE.join('\n'));
  await page.getByRole('button', { name: 'Preview' }).click();
  await page.getByRole('button', { name: 'Add to exchange' }).click();
  await page.getByRole('link', { name: /Draw & confirm/ }).first().click();
  await page.getByRole('button', { name: 'Generate draw' }).click();
  await page.getByRole('button', { name: 'Confirm this draw' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm draw' }).click();
  await page.getByRole('button', { name: /Create 5 links/ }).click();
  await expect(page.getByRole('link', { name: 'Preview' })).toHaveCount(5);
}

async function linkMap(page: Page): Promise<Map<string, string>> {
  const rows = page.locator('li').filter({ has: page.getByRole('link', { name: 'Preview' }) });
  const out = new Map<string, string>();
  for (let i = 0; i < (await rows.count()); i++) {
    const row = rows.nth(i);
    const name = (await row.locator('p.font-semibold').first().innerText()).split('“')[0]!.trim();
    out.set(name, (await row.getByRole('link', { name: 'Preview' }).getAttribute('href'))!);
  }
  return out;
}

async function openReveal(browser: Browser, link: string) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(link);
  await p.getByTestId('reveal-trigger').click();
  const recipient = (await p.getByTestId('recipient-name').innerText()).trim();
  return { ctx, p, recipient };
}

test('withdrawal creates a minimal repair as a new version with replacement links', async ({ page, browser }) => {
  await setupConfirmedWithLinks(page);
  const before = await linkMap(page);
  // Learn the assignments from the links themselves
  const assignments = new Map<string, string>();
  for (const [name, link] of before) {
    const { ctx, recipient } = await openReveal(browser, link);
    assignments.set(name, recipient);
    await ctx.close();
  }
  // Withdraw someone who isn't in a two-person swap, so exactly one change is the proven minimum.
  const leaver = [...assignments.keys()].find((n) => assignments.get(assignments.get(n)!) !== n)!;
  const giverOfLeaver = [...assignments].find(([, r]) => r === leaver)![0];

  await page.getByRole('link', { name: 'Withdrawals' }).click();
  await page.getByRole('checkbox', { name: leaver }).check();
  await page.getByRole('button', { name: 'Find the smallest change' }).click();
  await expect(page.getByRole('heading', { name: 'Proposed repair: 1 assignment change' })).toBeVisible();
  await expect(page.getByText('This is proven to be the fewest changes possible')).toBeVisible();
  await page.screenshot({ path: 'screenshots/withdrawal.png', fullPage: true });
  await page.getByRole('button', { name: /Apply as draw v2/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create new version' }).click();

  await expect(page.getByRole('heading', { name: /Personal links · Draw v2/ })).toBeVisible();
  await expect(page.getByText(/1 person needs a link/)).toBeVisible();
  await expect(page.getByText('Still valid from v1')).toHaveCount(3);
  await page.getByRole('button', { name: /Create 1 link/ }).click();
  await expect(page.getByText('Replacement')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Preview' })).toHaveCount(4);
  const after = await linkMap(page);
  const { ctx, p, recipient } = await openReveal(browser, after.get(giverOfLeaver)!);
  expect(recipient).toBe(assignments.get(leaver));
  await expect(p.getByText(/Draw Version 2/)).toBeVisible();
  await ctx.close();

  await page.getByRole('link', { name: 'Draw versions' }).click();
  await expect(page.getByText('Superseded', { exact: true })).toBeVisible();
  await expect(page.getByText(/Withdrawal repair · created/)).toBeVisible();
});

test('anonymous question relay round-trip through the organiser inbox', async ({ page, browser }) => {
  await setupConfirmedWithLinks(page);
  const links = await linkMap(page);
  const giverLink = links.get('Timon')!;

  // Giver asks
  const g = await openReveal(browser, giverLink);
  await g.p.getByLabel('Your question').fill('Do you prefer tea or coffee?');
  await g.p.getByRole('button', { name: 'Create question message' }).click();
  const qPacket = await g.p.getByLabel('Encrypted message to send').inputValue();

  // Organiser imports and creates the recipient link
  await page.getByRole('link', { name: 'Questions' }).click();
  await page.getByLabel('Message', { exact: true }).fill(`hey! ${qPacket}`);
  await page.getByRole('button', { name: 'Import message' }).click();
  await expect(page.getByText('“Do you prefer tea or coffee?”')).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`Create link for ${g.recipient}`) }).click();
  await expect(page.getByRole('button', { name: 'Copy message for recipient' })).toBeVisible();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy message for recipient' }).click();
  const recipientMsg = await page.evaluate(() => navigator.clipboard.readText());
  const qLink = recipientMsg.match(/https?:\/\/\S+/)![0];
  expect(recipientMsg).not.toContain('Timon');

  // Recipient answers
  const rctx = await browser.newContext();
  const r = await rctx.newPage();
  await r.goto(qLink);
  await expect(r.getByText('“Do you prefer tea or coffee?”')).toBeVisible();
  await expect(r.getByText('Timon')).toHaveCount(0);
  await r.getByLabel('Your answer').fill('Tea, always!');
  await r.getByRole('button', { name: 'Create reply message' }).click();
  const replyPacket = await r.getByLabel('Encrypted message to send').inputValue();
  await rctx.close();

  // Organiser imports reply and creates the answer link
  await page.getByLabel('Message', { exact: true }).fill(replyPacket);
  await page.getByRole('button', { name: 'Import message' }).click();
  await expect(page.getByText('“Tea, always!”')).toBeVisible();
  await page.getByRole('button', { name: /Create answer link for Timon/ }).click();
  await page.getByRole('button', { name: /Copy message for Timon/ }).click();
  const answerMsg = await page.evaluate(() => navigator.clipboard.readText());
  const aLink = answerMsg.match(/https?:\/\/\S+/)![0];
  await page.screenshot({ path: 'screenshots/questions.png', fullPage: true });

  await g.p.goto(aLink);
  await expect(g.p.getByText('“Tea, always!”')).toBeVisible();
  await g.ctx.close();
});
