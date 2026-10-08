import type { PageServerLoad } from './$types';
import { getConfigStore } from '$lib/server/services';

export const load: PageServerLoad = () => {
	const store = getConfigStore();
	const sites = store.sites();
	return {
		// The detail is logged by the loader; everyone gets the same notice.
		configNotLoaded: sites.length === 0 && store.state().lastError !== null,
		sites: sites.map((s) => ({
			id: s.id,
			naam: s.naam,
			repo: s.repo,
			model: s.review.model === 'goedkeuring' ? 'Met goedkeuring' : 'Direct'
		}))
	};
};
