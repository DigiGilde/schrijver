import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/auth/oidc', () => ({
	endSessionUrl: vi.fn(
		async (origin: string) => `https://sso.example/logout?post_logout_redirect_uri=${origin}/`
	)
}));

import { endSessionUrl } from '../../src/lib/auth/oidc';
import { POST } from '../../src/routes/uitloggen/+server';
import { load } from '../../src/routes/uitgelogd/+page.server';

describe('logout', () => {
	it('clears the session and redirects same-origin', () => {
		const cookies = { delete: vi.fn() };
		let location = '';
		try {
			POST({ cookies } as never);
		} catch (r) {
			location = (r as { location: string }).location;
		}
		expect(cookies.delete).toHaveBeenCalledWith('schrijver_sessie', { path: '/' });
		expect(location).toBe('/uitgelogd');
	});

	it('hands the end-session URL to the page, or null when the SSO is unreachable', async () => {
		const url = new URL('https://schrijver.example/uitgelogd');
		expect(await load({ url } as never)).toEqual({
			endSession: 'https://sso.example/logout?post_logout_redirect_uri=https://schrijver.example/'
		});
		vi.mocked(endSessionUrl).mockRejectedValueOnce(new Error('down'));
		const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
		expect(await load({ url } as never)).toEqual({ endSession: null });
		write.mockRestore();
	});
});
