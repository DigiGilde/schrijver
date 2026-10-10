import type { Page } from '@playwright/test';

/**
 * Acts as another known colleague of the local preview, through the development-only switch:
 * collega (beheerder of MOZa), derde (redactie of MOZa) or platform (on no team, platform admin).
 */
export async function als(page: Page, sub: 'collega' | 'derde' | 'platform') {
	await page
		.context()
		.addCookies([{ name: 'schrijver_test_als', value: sub, domain: 'localhost', path: '/' }]);
}

/** Acts as the test user again: beheerder of Digi Handboek, redactie of MOZa. */
export async function alsTestgebruiker(page: Page) {
	await page.context().clearCookies({ name: 'schrijver_test_als' });
}
