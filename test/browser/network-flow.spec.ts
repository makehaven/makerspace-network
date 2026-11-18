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
  for (const name of ['Find a space', 'Events', 'For organisers', 'Sign in']) await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
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
  await expect(page.getByText('No network gatherings announced right now.')).toBeVisible();
});

test("other makerspaces' events list by date, filter by topic, and keep later ones folded", async ({ page }) => {
  await page.goto('/test/browser/network-flow.html?view=events');
  // The network's own event stays first.
  await expect(page.getByRole('link', { name: 'Explore Maker Bonanza' })).toBeVisible();
  const list = page.locator('.community-list li');
  await expect(list).toHaveCount(2);
  await expect(list.first()).toContainText('Intro to Woodturning');
  await expect(list.first()).toContainText('+1 more date');
  await expect(list.nth(1)).toContainText('for kids');
  await expect(list.first().getByRole('link', { name: 'Intro to Woodturning' })).toHaveAttribute('href', 'https://example.test/go/a');
  await page.getByRole('button', { name: 'Ceramics & pottery (1)' }).click();
  await expect(list).toHaveCount(1);
  await expect(list.first()).toContainText('Kids Clay Camp');
  await page.getByRole('button', { name: 'Woodworking (2)' }).click();
  await expect(list).toHaveCount(1);
  await page.getByRole('button', { name: 'Show 1 later event' }).click();
  await expect(list).toHaveCount(2);
  // If the calendar is down, the page still works without that section.
  await page.goto('/test/browser/network-flow.html?view=events&mode=calfail');
  await expect(page.getByRole('link', { name: 'Explore Maker Bonanza' })).toBeVisible();
  await expect(page.locator('.community-events')).toHaveCount(0);
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

test('the header says who is signed in, on any page, without loading Firebase', async ({ page, context }) => {
  await context.addCookies([{ name: 'mn_who', value: encodeURIComponent('Jo Rivera'), domain: '127.0.0.1', path: '/' }]);
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link', { name: 'My network, signed in as Jo Rivera' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0);
  await context.clearCookies();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(nav.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
});

test('a Google photo replaces the initial; any other address is ignored', async ({ page, context }) => {
  // Serve a stand-in for Google's photo host so nothing leaves the machine.
  await page.route('https://lh3.googleusercontent.com/**', (r) => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>' }));
  await context.addCookies([
    { name: 'mn_who', value: encodeURIComponent('Jo Rivera'), domain: '127.0.0.1', path: '/' },
    { name: 'mn_pic', value: encodeURIComponent('https://lh3.googleusercontent.com/a/ABC123=s96-c'), domain: '127.0.0.1', path: '/' },
  ]);
  await page.goto('/');
  const account = page.getByRole('link', { name: 'My network, signed in as Jo Rivera' });
  await expect(account.locator('img.avatar')).toHaveAttribute('src', 'https://lh3.googleusercontent.com/a/ABC123=s96-c');
  await context.addCookies([{ name: 'mn_pic', value: encodeURIComponent('https://evil.example/x.png'), domain: '127.0.0.1', path: '/' }]);
  await page.reload();
  await expect(account.locator('img')).toHaveCount(0);
  await expect(account.locator('.avatar')).toHaveText('J');
});

test('the listing reads old access answers in the new terms and records how much of each capability', async ({ page }) => {
  // Keep it off Google's servers; module paths containing "firebase" must still load.
  await page.route(/^https:\/\/[^/]*(googleapis|gstatic|firebaseapp)\.com\//, (r) => r.abort());
  await page.goto('/test/browser/network-flow.html?view=listing');
  // Old values become the new ones; "sponsored" (who pays) is gone from access.
  await expect(page.getByRole('checkbox', { name: 'Membership', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Free', exact: true })).toBeChecked();
  await expect(page.getByText('Monthly membership')).toHaveCount(0);
  await expect(page.getByText('Sponsored / corporate funded')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /Only an affiliated group/ })).toBeChecked();
  // A level per ticked capability, explained once above the list.
  await expect(page.getByText('For bike repair: a bag of tools.', { exact: false })).toBeVisible();
  await page.getByLabel('How much Woodshop — table saw, jointer, planer, bandsaw').selectOption('full_shop');
  await page.getByLabel('How much 3D printing — FDM').selectOption('basic');
  // Unticking a capability takes its level with it.
  await page.getByRole('checkbox', { name: '3D printing — FDM' }).uncheck();
  await expect(page.getByLabel('How much 3D printing — FDM')).toHaveCount(0);
  await page.getByRole('button', { name: 'Send listing' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__sent)).toBeTruthy();
  const sent = await page.evaluate(() => (window as any).__sent);
  expect(sent.capability_levels).toEqual({ woodworking_machine: 'full_shop' });
  expect(sent.membership_models.sort()).toEqual(['free_access', 'membership']);
  expect(sent.eligibility).toBe('affiliated_only');
});


test('campus spaces sit below the community spaces and say who they are for', async ({ page }) => {
  await page.goto('/?region=us-ct');
  const below = page.locator('a.card.mini');
  await expect(below.filter({ hasText: 'Yale Center for Engineering Innovation and Design' })).toContainText('Campus space: its own students and staff only');
  // Unconfirmed public access keeps a well-equipped campus space out of the main list.
  await expect(below.filter({ hasText: 'SCSU Makerspace at Buley Library' })).toContainText('Campus space: probably its own students and staff');
  await expect(page.locator('.cards:not(.compact) a.card', { hasText: 'SCSU Makerspace' })).toHaveCount(0);
  await below.filter({ hasText: 'SCSU Makerspace' }).click();
  await expect(page.locator('.access-note')).toContainText('A campus space.');
  await page.goto('/?page=space&space=yale-ceid');
  await expect(page.locator('.access-note')).toContainText('Not open to the public.');
  await page.goto('/?page=space&space=makehaven');
  await expect(page.locator('.access-note')).toHaveCount(0);
});

test('someone with no space is asked once: member picks a space, or a ZIP suggests public spaces first', async ({ page }) => {
  await page.goto('/test/browser/network-flow.html?view=connect');
  await page.getByRole('button', { name: 'Not yet: show me spaces near me' }).click();
  await page.getByLabel('Your ZIP code').fill('06511');
  const near = page.locator('.near-list li');
  await expect(near).toHaveCount(3);
  await expect(near.filter({ hasText: 'MakeHaven' })).toHaveCount(1);
  // Yale CEID and SCSU are close by but not open to the public, so public spaces come first.
  await expect(near.filter({ hasText: /Yale|SCSU/ })).toHaveCount(0);
  await page.getByLabel('Your ZIP code').fill('10001');
  await expect(page.getByText('We can only suggest spaces in Connecticut so far.')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: "I'm a member" }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Choose your makerspace.')).toBeVisible();
  await page.getByRole('searchbox').fill('Spark');
  await page.getByRole('button', { name: /SPARK Makerspace/ }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __space?: string }).__space)).toBe('spark-makerspace');
});

test('the directory photo is a slideshow you can step through, and it stays put for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?region=us-ct');
  const show = page.locator('.slideshow');
  await expect(show.locator('figcaption')).toHaveText('A woodworking class at MakeHaven, New Haven');
  await expect(show.locator('.slide-dots button')).toHaveCount(4);
  await page.waitForTimeout(6500);
  await expect(show.locator('figcaption')).toHaveText('A woodworking class at MakeHaven, New Haven');
  await show.getByRole('button', { name: /Photo 3 of 4/ }).click();
  await expect(show.locator('figcaption')).toHaveText('Welding at MakeHaven, New Haven');
  await expect(show.locator('.slide.on img')).toHaveAttribute('src', '/photos/makehaven-welding.webp');
});
