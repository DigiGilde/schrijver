import type { Identity } from '$lib/forge/trailers';
import { pseudonym } from '$lib/forge/trailers';
import type { Session } from './session';
import type { UserPrefs } from './users';

export function identityFor(prefs: UserPrefs, session: Session): Identity {
	if (prefs.identity === 'gekoppeld' && prefs.githubLogin && prefs.githubId !== null) {
		return { kind: 'gekoppeld', name: session.name, githubId: prefs.githubId, login: prefs.githubLogin };
	}
	if (prefs.identity === 'op-naam') {
		return { kind: 'op-naam', name: session.name, email: session.email };
	}
	return { kind: 'anoniem', pseudoniem: pseudonym(process.env.PSEUDONYM_SECRET ?? '', session.sub) };
}
