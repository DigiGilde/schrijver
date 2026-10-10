import type { LayoutServerLoad } from './$types';
import { devBypassesAllowed } from '$lib/server/security';

export const load: LayoutServerLoad = ({ locals }) => ({
	userName: locals.user?.session.name ?? null,
	email: locals.user?.session.email ?? null,
	testEnvironment: process.env.SCHRIJVER_FAKE_FORGE === '1' && devBypassesAllowed()
});
