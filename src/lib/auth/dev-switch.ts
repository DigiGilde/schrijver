import { devBypassesAllowed } from '$lib/server/security';
import type { Session } from './session';
import type { TeamStore } from './team';

export const ACT_AS_COOKIE = 'schrijver_test_als';

type Env = Record<string, string | undefined>;

/**
 * Development and test only: the sub of another known user an end-to-end test acts as, instead of
 * the test session's own. Ignored without a test session and wherever the development bypasses are.
 */
export function actingAs(cookie: string | undefined, env: Env = process.env): string | null {
	if (!cookie || !devBypassesAllowed(env) || !env.SCHRIJVER_TEST_SESSION) return null;
	return cookie;
}

/** The test session as that other user, from the profile saved at their login; null when unknown. */
export async function sessionAs(
	sub: string,
	base: Session,
	team: TeamStore
): Promise<Session | null> {
	const profile = await team.profile(sub);
	if (!profile) return null;
	return {
		...base,
		sub,
		name: profile.name ?? '',
		email: profile.email ?? '',
		emailVerified: profile.email !== null
	};
}
