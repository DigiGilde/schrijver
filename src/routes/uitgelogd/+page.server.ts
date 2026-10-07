import type { PageServerLoad } from './$types';
import { endSessionUrl } from '$lib/auth/oidc';
import { log } from '$lib/log';

export const load: PageServerLoad = async ({ url }) => {
	let endSession: string | null = null;
	try {
		endSession = await endSessionUrl(url.origin);
	} catch (err) {
		log.warn('auth.end_session_unavailable', {
			reason: err instanceof Error ? err.message : 'unknown'
		});
	}
	return { endSession };
};
