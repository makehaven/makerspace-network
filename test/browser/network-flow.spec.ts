import { test, expect } from '@playwright/test';

test('space search survives details, Back, refresh and a shared URL', async ({ page }) => {
  await page.goto('/?page=about');
  await page.goto('/?region=us-ct');
  await page.getByRole('searchbox', { name: 'Search spaces' }).fill('MakeHaven');
  await page.getByLabel('Open to non-members', { exact: false }).check();
  await expect(page).toHaveURL(/q=MakeHaven/);
  await expect(page).toHaveURL(/public=1/);
  const saved = page.url();
  await page.locator('a.card').filter({ has: page.getByRole('heading', { name: 'MakeHaven', exact: true }) }).click();
  await expect(page).toHaveURL(/space=makehaven/);
  await page.goBack();
  await expect(page.getByRole('searchbox', { name: 'Search spaces' })).toHaveValue('MakeHaven');
  await expect(page.getByLabel('Open to non-members', { exact: false })).toBeChecked();
  await page.reload();
  await expect(page.getByRole('searchbox', { name: 'Search spaces' })).toHaveValue('MakeHaven');
  await page.goto(saved);
  await expect(page.locator('.result-count')).toContainText('1 of');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page).toHaveURL(/\?region=us-ct$/);
  await page.goBack();
  // No per-character history entries were created.
  await expect(page).toHaveURL(/page=about/);
});

test('maker load failure stays distinct from empty results and retry preserves search', async ({ page }) => {
  await page.goto('/test/browser/network-flow.html?mode=retry&q=New+Haven');
  await expect(page.getByRole('heading', { name: "We couldn't load the makers" })).toBeVisible();
  await expect(page.getByText('The maker directory is just getting started')).toHaveCount(0);
  await expect(page.getByText('Loading makers…')).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('heading', { name: 'Test Maker', exact: true })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search makers' })).toHaveValue('New Haven');
  await page.getByRole('searchbox', { name: 'Search makers' }).fill('no matching maker');
  await expect(page.getByRole('status')).toContainText('0 makers');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('heading', { name: 'Test Maker', exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await page.goto('/test/browser/network-flow.html?mode=empty');
  await expect(page.getByRole('link', { name: 'Create your maker profile' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
});

test('navigation and sign-in explain maker, organiser, invitation and event journeys on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?page=home');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  for (const name of ['Find a space', 'Meet makers', 'Events', 'For organisers', 'My network']) await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
  await expect(page.getByText('Use any email address you check regularly.')).toBeVisible();
  await expect(page.getByLabel('Email address')).toHaveAttribute('autocomplete', 'email');
  await expect(page.getByText('Your network account is free.', { exact: false })).toBeVisible();
  await page.screenshot({ path: '/tmp/network-signin-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await nav.getByRole('link', { name: 'For organisers' }).click();
  await expect(page.getByRole('link', { name: 'Space and partner roster', exact: true })).toBeVisible();
  await page.goto('/?page=join');
  await expect(page.getByText('If your space or organisation gives you an email address,', { exact: false })).toBeVisible();
  await page.goto('/?page=join&invite=fixture');
  await expect(page.getByText('Use the exact email address your invitation was sent to.')).toBeVisible();
  await page.goto('/?page=maker-edit&registration=fixture');
  await expect(page.getByText('Use the email address on your event registration', { exact: false })).toBeVisible();
});

test('events show registration state and a helpful empty state', async ({ page }) => {
  await page.goto('/test/browser/network-flow.html?view=events');
  await expect(page.getByText('Registration not open yet', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explore Maker Bonanza' })).toHaveAttribute('href', /event=fixture-event/);
  await page.goto('/test/browser/network-flow.html?view=events&mode=empty');
  await expect(page.getByRole('heading', { name: 'No upcoming events announced yet' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Find a space', exact: true })).toBeVisible();
});


test('email-link failure stays inline and retry can recover without losing the address', async ({ page }) => {
  let requests = 0;
  await page.route('https://identitytoolkit.googleapis.com/**', async (route) => {
    if (!route.request().url().includes('sendOobCode')) return route.abort();
    requests++;
    await route.fulfill(requests === 1
      ? { status: 400, json: { error: { message: 'TOO_MANY_ATTEMPTS_TRY_LATER' } } }
      : { json: { email: 'maker@example.test' } });
  });
  await page.goto('/?page=home');
  await page.getByLabel('Email address').fill('maker@example.test');
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByRole('alert')).toContainText("We couldn't send the sign-in link");
  await expect(page.getByLabel('Email address')).toHaveValue('maker@example.test');
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByRole('status')).toContainText('We sent a sign-in link to maker@example.test');
  expect(requests).toBe(2);
});

test('activity filters work by keyboard, persist, and leave mobile search accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?region=us-ct');
  await expect(page.getByRole('searchbox', { name: 'Search spaces' })).toBeVisible();
  const textiles = page.getByRole('button', { name: 'Textiles', exact: true });
  await textiles.focus(); await page.keyboard.press('Enter');
  await expect(textiles).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/domain=textiles/);
  await expect(page.locator('.space-list-card').filter({ hasText: 'MakeHaven' })).toContainText('Sewing and textiles');
  await expect(page.locator('.space-list-card').filter({ hasText: 'Danbury Makerspace' })).toHaveCount(0);
  await page.reload();
  await expect(textiles).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(textiles).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.space-list-card').filter({ hasText: 'Danbury Makerspace' })).toBeVisible();
  await page.locator('.directory-map > summary').click();
  await expect(page.locator('.map-panel')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
