import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	userName: locals.user?.session.name ?? null,
	email: locals.user?.session.email ?? null
});
