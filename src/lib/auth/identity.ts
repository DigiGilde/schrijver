import { createHmac } from 'node:crypto';
import type { Identity } from '$lib/forge/trailers';
import { pseudonym } from '$lib/forge/trailers';
import type { Session } from './session';
import type { SettingsValues } from './team';
import type { UserPrefs } from './users';

type Kind = Identity['kind'];
/** The ways to sign that a site allows, from its settings. */
type Allowed = Pick<SettingsValues, 'identiteitToegestaan'>;

/** Whether the user can sign as this kind at all, regardless of the site. */
function eligible(kind: Kind, prefs: UserPrefs, session: Session): boolean {
	if (kind === 'gekoppeld') return !!prefs.githubLogin && prefs.githubId !== null;
	if (kind === 'op-naam') return session.emailVerified;
	return true;
}

/** How much a kind reveals: a fallback may never reveal more than the user chose. */
export const REVEALS: Record<Kind, number> = { anoniem: 0, gekoppeld: 1, 'op-naam': 2 };

/**
 * The kind the user signs with on this site: their own choice when the site allows it, otherwise
 * the first kind the site allows that the user can use and that reveals no more than the choice.
 * Anoniem is always allowed.
 */
export function effectiveKind(prefs: UserPrefs, session: Session, settings: Allowed): Kind {
	const allowed = (kind: Kind) =>
		kind === 'anoniem' || settings.identiteitToegestaan.includes(kind);
	const chosen: Kind = eligible(prefs.identity, prefs, session) ? prefs.identity : 'anoniem';
	if (allowed(chosen)) return chosen;
	return (
		settings.identiteitToegestaan.find(
			(k) => allowed(k) && REVEALS[k] <= REVEALS[chosen] && eligible(k, prefs, session)
		) ?? 'anoniem'
	);
}

export function actorPseudonym(session: Pick<Session, 'sub'>): string {
	const secret = process.env.PSEUDONYM_SECRET;
	if (!secret) throw new Error('PSEUDONYM_SECRET is not set');
	return pseudonym(secret, session.sub);
}

/**
 * The key the beheer page knows a member of a site by, in its data and its forms: not the sub, and
 * derived under a purpose of its own, so never the pseudonym either.
 */
export function memberKey(siteId: string, sub: string): string {
	const secret = process.env.PSEUDONYM_SECRET;
	if (!secret) throw new Error('PSEUDONYM_SECRET is not set');
	return createHmac('sha256', secret)
		.update(`schrijver:lid\0${siteId}\0${sub}`)
		.digest('hex')
		.slice(0, 32);
}

export function identityFor(prefs: UserPrefs, session: Session, settings: Allowed): Identity {
	const kind = effectiveKind(prefs, session, settings);
	if (kind === 'gekoppeld' && prefs.githubLogin && prefs.githubId !== null) {
		// The GitHub login, not the SSO name: a pseudonymous GitHub profile stays pseudonymous.
		return { kind, name: prefs.githubLogin, githubId: prefs.githubId, login: prefs.githubLogin };
	}
	if (kind === 'op-naam') return { kind, name: session.name, email: session.email };
	return { kind: 'anoniem', pseudoniem: actorPseudonym(session) };
}

/** Every identity the user can sign with on some site; ownership of a proposal matches any of them. */
export function identitiesFor(prefs: UserPrefs, session: Session): Identity[] {
	const all: Identity[] = [{ kind: 'anoniem', pseudoniem: actorPseudonym(session) }];
	if (prefs.githubLogin && prefs.githubId !== null) {
		all.push({
			kind: 'gekoppeld',
			name: prefs.githubLogin,
			githubId: prefs.githubId,
			login: prefs.githubLogin
		});
	}
	if (session.emailVerified && session.email) {
		all.push({ kind: 'op-naam', name: session.name, email: session.email });
	}
	return all;
}
