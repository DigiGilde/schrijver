import type { Identity } from '$lib/forge/trailers';
import { pseudonym } from '$lib/forge/trailers';
import type { Session } from './session';
import type { UserPrefs } from './users';

export function identityFor(prefs: UserPrefs, session: Session): Identity {
	if (prefs.identity === 'gekoppeld' && prefs.githubLogin && prefs.githubId !== null) {
		return {
			kind: 'gekoppeld',
			name: session.name,
			githubId: prefs.githubId,
			login: prefs.githubLogin
		};
	}
	if (prefs.identity === 'op-naam' && session.emailVerified) {
		return { kind: 'op-naam', name: session.name, email: session.email };
	}
	const secret = process.env.PSEUDONYM_SECRET;
	if (!secret) throw new Error('PSEUDONYM_SECRET is not set');
	return { kind: 'anoniem', pseudoniem: pseudonym(secret, session.sub) };
}
