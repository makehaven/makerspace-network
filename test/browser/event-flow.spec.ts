import type { MakerDoc } from '../../src/makers/model';
import { test, expect } from '@playwright/test';

const emptyAnswers = { relationship: [], home_space_id: null, home_space_other: '', looking_for_space: false, looking_for: [], organization: '', unconference_before: null, excited: '', challenged: '', town: '', makes: '', offer_session: '', tracks: [], dietary: '', access_needs: '', over_21: null };
const consents = { attendee_list: false, peer_contact: false, followup: false, network: false, space_share: false, space_intro: false };
const registration = () => ({ event_id: 'browser-fixture', name: 'Test Maker', email: 'maker@example.test', status: 'confirmed', tier_name: 'General admission', price_cents: 5000, amount_paid_cents: 5000, answers: structuredClone(emptyAnswers), consents: { ...consents }, can_pay: false, can_accept_free: false, can_cancel: false, can_refund: true, can_transfer: true, refund_until: '2027-01-20T12:00:00Z' });
const fixture = '/test/browser/event-flow.html';

test('short checkout validates email and sends no implicit sharing consent', async ({ page }) => {
  let submitted: any;
  await page.route('**/api/events/register', async (r) => {
    submitted = r.request().postDataJSON();
    await r.fulfill({ json: { outcome: 'already' } });
  });
  await page.goto(fixture);
  await expect(page.getByText('Which of these sound like you?')).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(2);
  await page.getByLabel('Full name').fill('Test Maker');
  await page.getByLabel('Email address').fill('Logan');
  await page.getByLabel("I'm 18 or older").check();
  await page.getByLabel('I agree to the event terms').check();
  await page.getByRole('button', { name: 'Continue to payment · $50' }).click();
  await expect(page.locator('#registration-email-error')).not.toBeEmpty();
  expect(submitted).toBeUndefined();
  await page.getByLabel('Email address').fill('maker@example.test');
  await page.getByRole('button', { name: 'Continue to payment · $50' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  expect(submitted.consents).toEqual(consents);
  expect(submitted.answers.excited).toBe('');
  expect(submitted.answers.challenged).toBe('');
});

test('introduction saves in stages, finds a space, preserves private answers and explains connections', async ({ page }) => {
  let reg = registration();
  let failSave = false;
  const saved: any[] = [];
  await page.route('**/api/events/manage', async (r) => {
    const b = r.request().postDataJSON();
    if (b.action === 'update') {
      if (failSave) { await r.fulfill({ status: 503, json: { error: 'Could not save. Try again.' } }); return; }
      saved.push(b); reg = { ...reg, answers: b.answers, consents: b.consents };
    }
    if (b.action === 'attendees') { await r.fulfill({ json: { attendees: [
      { name: 'Alex', space: 'MakeHaven', makes: 'Textiles', offer_session: '', tracks: ['arts'], email: null, profile: null },
      { name: 'Sam', space: 'Spark', makes: 'Robots', offer_session: '', tracks: ['ventures'], email: null, profile: null },
    ] } }); return; }
    if (b.action === 'refund') reg = { ...reg, status: 'refunded', can_refund: false };
    await r.fulfill({ json: reg });
  });
  await page.goto(`${fixture}?mode=manage`);
  await expect(page.getByText('Your ticket is confirmed. Your email has the link to return here.')).toBeVisible();
  await expect(page.locator('#ticket-details')).not.toHaveAttribute('open', '');
  await page.getByLabel('Learning new skills', { exact: true }).check();
  await page.getByLabel("I'm new and curious", { exact: true }).check();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByLabel('What would you like to learn or try making?')).toBeVisible();
  await page.getByLabel('What would you like to learn or try making?').fill('Learn to sew a backpack');
  await page.getByLabel('Where are you getting stuck').fill('Private challenge for organisers');
  await page.getByRole('searchbox').fill('New Haven');
  await page.getByRole('button', { name: /MakeHaven New Haven/ }).click();
  await expect(page.locator('.space-selected')).toContainText('MakeHaven');
  await page.getByLabel('Your town and state').fill('New Haven, CT');
  await page.getByLabel('Arts, crafting and design').check();
  failSave = true;
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save');
  await expect(page.getByLabel('What would you like to learn or try making?')).toHaveValue('Learn to sew a backpack');
  failSave = false;
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByLabel('Your short maker introduction').fill('Learning to sew bags');
  await page.locator('.intro-card').getByLabel('Show my name, space').check();
  await page.getByRole('button', { name: 'Save and see connections' }).click();
  await expect(page.getByRole('heading', { name: 'Make the most of your day' })).toBeVisible();
  await expect(page.getByText('Private challenge for organisers')).toHaveCount(0);
  expect(saved.at(-1).answers.challenged).toBe('Private challenge for organisers');
  expect(saved.at(-1).consents.peer_contact).toBe(false);
  await expect(page.getByRole('link', { name: 'Review a maker profile draft' })).toHaveAttribute('href', /registration=fixture-registration/);
  await page.getByRole('button', { name: 'Show the list' }).click();
  await page.getByLabel('Show people with a shared space or event interest').check();
  await expect(page.locator('.attendee-list')).toContainText('Alex');
  await expect(page.locator('.attendee-list')).not.toContainText('Sam');
  await expect(page.locator('.attendee-list')).toContainText('Also from MakeHaven');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Edit your introduction' })).toBeVisible();
  await page.getByRole('link', { name: 'Refund or transfer' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Refund my ticket' }).click();
  await expect(page.getByText('This ticket has been refunded.')).toBeVisible();
  await expect(page.locator('.intro-card')).toHaveCount(0);
  await expect(page.getByText('Test Maker · General admission · $50 refunded')).toBeVisible();
});

test('mobile search supports keyboard, no result, unlisted and no-space choices', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let reg = registration();
  await page.route('**/api/events/manage', async (r) => {
    const b = r.request().postDataJSON();
    if (b.action === 'update') reg = { ...reg, answers: b.answers, consents: b.consents };
    await r.fulfill({ json: reg });
  });
  await page.goto(`${fixture}?mode=manage`);
  await page.getByLabel('A community of makers', { exact: true }).check();
  await page.getByLabel('I help run a makerspace', { exact: true }).check();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByLabel('What challenge would you like to compare notes on with other organisers?')).toBeVisible();
  await page.getByRole('searchbox').fill('zzzz not a space');
  await expect(page.getByText('No matching space.')).toBeVisible();
  await page.getByRole('button', { name: "My space isn't listed" }).click();
  await page.getByLabel('Space name and town').fill('New workshop, Hartford');
  await page.getByRole('button', { name: 'Change', exact: true }).click();
  await page.getByRole('searchbox').fill('MakeHaven');
  await page.getByRole('searchbox').press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('.space-selected')).toContainText('MakeHaven');
  await page.getByRole('button', { name: 'Change', exact: true }).click();
  await page.getByRole('button', { name: 'No makerspace yet' }).click();
  await expect(page.locator('.space-selected')).toContainText('No makerspace yet');
  await page.getByRole('button', { name: 'Save and finish later' }).click();
  expect(reg.answers.home_space_id).toBeNull();
  expect(reg.answers.home_space_other).toBe('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/bonanza-flow-mobile.png', fullPage: true });
});

test('calendar uses event details without leaking the private ticket link', async ({ page }) => {
  await page.route('**/api/events/manage', (r) => r.fulfill({ json: registration() }));
  await page.goto(`${fixture}?mode=manage`);
  const downloadReady = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Add to calendar' }).click();
  const download = await downloadReady;
  const { readFile } = await import('node:fs/promises');
  const calendar = await readFile((await download.path())!, 'utf8');
  expect(calendar).toContain('DTSTART:20270122T140000Z');
  expect(calendar).toContain('DTEND:20270122T220000Z');
  expect(calendar).not.toContain('test-token');
  expect(calendar).not.toContain('fixture-registration');
  await page.screenshot({ path: '/tmp/bonanza-flow-desktop.png', fullPage: true });
});

test('profile draft uses only public introduction fields and preserves an existing profile', async () => {
  const { eventProfileDraft } = await import('../../src/makers/eventDraft');
  const draft = { name: 'Test Maker', answers: { ...emptyAnswers, town: 'Boston, Massachusetts', makes: 'I make bags', excited: 'Private project', challenged: 'Private challenge', dietary: 'Private food needs', access_needs: 'Private access needs' } };
  const fresh = { display_name: '', bio: '', town: '', state: 'CT', home_space_id: null, visibility: 'community' } as MakerDoc;
  const patch = eventProfileDraft(fresh, false, draft);
  expect(patch).toMatchObject({ bio: 'I make bags', town: 'Boston', state: 'MA', visibility: 'hidden' });
  expect(JSON.stringify(patch)).not.toContain('Private');
  const existing = { ...fresh, bio: 'My own bio', town: 'New Haven', state: 'CT', visibility: 'public' as const };
  const updated = { ...existing, ...eventProfileDraft(existing, true, draft) };
  expect(updated.bio).toBe('My own bio');
  expect(updated.town).toBe('New Haven');
  expect(updated.state).toBe('CT');
  expect(updated.visibility).toBe('public');
});

test('the scholarship and member tickets stay out of sight until asked for', async ({ page }) => {
  let submitted: any;
  await page.route('**/api/events/register', async (r) => { submitted = r.request().postDataJSON(); await r.fulfill({ json: { outcome: 'already' } }); });
  await page.goto(fixture);
  await expect(page.getByRole('radio')).toHaveCount(1);
  await expect(page.getByText('Scholarship')).toHaveCount(0);
  await expect(page.getByText('Makerspace member')).toHaveCount(0);
  await page.getByRole('button', { name: 'Is the $50 price keeping you from coming?' }).click();
  await expect(page.getByRole('radio')).toHaveCount(2);
  await expect(page.getByRole('radio', { name: /Scholarship/ })).toBeChecked();
  await expect(page.getByLabel('The full price would be a barrier for me.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Is the $50 price keeping you from coming?' })).toHaveCount(0);
  await page.getByLabel('Full name').fill('Test Maker');
  await page.getByLabel('Email address').fill('maker@example.test');
  await page.getByLabel('The full price would be a barrier for me.').check();
  await page.getByLabel("I'm 18 or older").check();
  await page.getByLabel('I agree to the event terms').check();
  await page.getByRole('button', { name: 'Continue to payment · $25' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  expect(submitted.tier_id).toBe('scholarship');
  expect(submitted.attested).toBe(true);
});

test('a makerspace can ask to be a partner in one step, and partners and sponsors show logos', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let sent: any;
  await page.route('**/api/events/interest', async (r) => { sent = r.request().postDataJSON(); await r.fulfill({ json: { outcome: 'requested' } }); });
  await page.goto(`${fixture}?mode=partners`);
  await expect(page.locator('.logo-wall li', { hasText: 'MakeHaven' }).locator('img')).toBeVisible();
  await expect(page.locator('.logo-wall.sponsors img')).toBeVisible();
  await page.getByRole('button', { name: 'Become a partner makerspace' }).click();
  await expect(page.getByRole('button', { name: 'No makerspace yet' })).toHaveCount(0);
  await page.getByLabel('Your name').fill('Pat Organiser');
  await page.getByLabel('Email').fill('pat@example.test');
  await page.getByRole('button', { name: "We're in" }).click();
  await expect(page.getByText('Please choose your makerspace.')).toBeVisible();
  expect(sent).toBeUndefined();
  await page.getByRole('searchbox').fill('Danbury');
  await page.getByRole('button', { name: /Danbury Makerspace/ }).click();
  await page.getByRole('button', { name: "We're in" }).click();
  await expect(page.getByText(/will add Danbury Makerspace here shortly/)).toBeVisible();
  await expect(page.locator('.share-link code')).toContainText('?ref=danbury-makerspace');
  expect(sent).toMatchObject({ partner: true, home_space_id: 'danbury-makerspace', name: 'Pat Organiser', email: 'pat@example.test' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
