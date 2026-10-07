import type { PageServerLoad } from './$types';
import { getConfigStore } from '$lib/server/services';

export const load: PageServerLoad = () => ({
	sites: getConfigStore()
		.sites()
		.map((s) => ({
			id: s.id,
			naam: s.naam,
			repo: s.repo,
			model: s.review.model === 'goedkeuring' ? 'Met goedkeuring' : 'Direct'
		}))
});
