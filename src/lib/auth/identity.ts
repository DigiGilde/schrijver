import type { SiteConfig } from '$lib/config/types';
import type { Identity } from '$lib/forge/trailers';
import { pseudonym } from '$lib/forge/trailers';
import type { Session } from './session';
import type { UserPrefs } from './users';

type Kind = Identity['kind'];

/** Whether the user can sign as this kind at all, regardless of the site. */
function eligible(kind: Kind, prefs: UserPrefs, session: Session): boolean {
	if (kind === 'gekoppeld') return !!prefs.githubLogin && prefs.githubId !== null;
	if (kind === 'op-naam') return session.emailVerified;
	return true;
}

/**
 * The kind the user signs with on this site: their own choice when the site allows it, otherwise
 * the first kind the site allows that the user can use. Anoniem is always allowed.
 */
export function effectiveKind(prefs: UserPrefs, session: Session, site: Pick<SiteConfig, 'identiteit'>): Kind {
	const allowed = (kind: Kind) => kind === 'anoniem' || site.identiteit.toegestaan.includes(kind);
	const chosen: Kind = eligible(prefs.identity, prefs, session) ? prefs.identity : 'anoniem';
	if (allowed(chosen)) return chosen;
	return site.identiteit.toegestaan.find((k) => allowed(k) && eligible(k, prefs, session)) ?? 'anoniem';
}

export function actorPseudonym(session: Pick<Session, 'sub'>): string {
	const secret = process.env.PSEUDONYM_SECRET;
	if (!secret) throw new Error('PSEUDONYM_SECRET is not set');
	return pseudonym(secret, session.sub);
}

export function identityFor(prefs: UserPrefs, session: Session, site: Pick<SiteConfig, 'identiteit'>): Identity {
	const kind = effectiveKind(prefs, session, site);
	if (kind === 'gekoppeld' && prefs.githubLogin && prefs.githubId !== null) {
		// The GitHub login, not the SSO name: a pseudonymous GitHub profile stays pseudonymous.
		return { kind, name: prefs.githubLogin, githubId: prefs.githubId, login: prefs.githubLogin };
	}
	if (kind === 'op-naam') return { kind, name: session.name, email: session.email };
	return { kind: 'anoniem', pseudoniem: actorPseudonym(session) };
}
