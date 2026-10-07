import { expect, test } from '@playwright/test';

// Both flows leave Schrijver after a form POST. CSP form-action 'self' forbids a form redirect to another
// origin, so the POST lands on a same-origin page that navigates on; these tests prove the browser gets there.

test('linking GitHub reaches the GitHub authorize page', async ({ page }) => {
	await page.route('https://github.com/**', (route) =>
		route.fulfill({ contentType: 'text/html', body: '<title>GitHub</title><p>GitHub stub</p>' })
	);
	const violations: string[] = [];
	page.on('console', (m) => {
		if (m.text().includes('Content Security Policy')) violations.push(m.text());
	});
	await page.goto('/instellingen');
	await page.evaluate(() => customElements.whenDefined('nldd-button'));
	await page.getByRole('button', { name: 'Koppel je GitHub-account' }).click();
	await page.waitForURL(/^https:\/\/github\.com\/login\/oauth\/authorize\?/);
	const url = new URL(page.url());
	expect(url.searchParams.get('client_id')).toBe('Iv1.e2e');
	expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:4391/login/github/callback');
	expect(url.searchParams.get('code_challenge_method')).toBe('S256');
	expect(violations).toEqual([]);
});

test('the start page offers a link to GitHub without JavaScript', async ({ browser }) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();
	const res = await page.request.post('/login/github', {
		headers: { origin: 'http://localhost:4391' },
		form: {},
		maxRedirects: 0
	});
	expect(res.status()).toBe(303);
	expect(res.headers().location).toBe('/login/github/start');
	await page.goto('/login/github/start');
	const link = page.getByRole('link', { name: 'Ga verder naar GitHub' });
	await expect(link).toHaveAttribute('href', /^https:\/\/github\.com\/login\/oauth\/authorize\?/);
	await context.close();
});

test('logging out also signs out at the SSO and clears drafts', async ({ page }) => {
	await page.goto('/instellingen');
	await page.evaluate(() => localStorage.setItem('schrijver:x:new:a.md', '{}'));
	await page.evaluate(() => customElements.whenDefined('nldd-button'));
	await page.getByRole('button', { name: 'Uitloggen' }).click();
	await page.waitForURL(/^http:\/\/localhost:4392\/logout\?/);
	const url = new URL(page.url());
	expect(url.searchParams.get('post_logout_redirect_uri')).toBe('http://localhost:4391/');
	expect(url.searchParams.get('client_id')).toBe('schrijver-e2e');
	await page.goto('/help');
	expect(await page.evaluate(() => localStorage.getItem('schrijver:x:new:a.md'))).toBeNull();
});

test('the logged-out page offers a link to the SSO without JavaScript', async ({ browser }) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();
	await page.goto('/uitgelogd');
	await expect(page.getByRole('link', { name: 'Meld je af bij SSO Rijk' })).toHaveAttribute(
		'href',
		/^http:\/\/localhost:4392\/logout\?/
	);
	await context.close();
});
