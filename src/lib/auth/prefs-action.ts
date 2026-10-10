import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { log } from '$lib/log';
import { getConfigStore } from '$lib/server/services';
import { visibleSites } from '$lib/server/site-access';
import { actorPseudonym } from './identity';
import type { SiteUser } from './roles';
import { siteSettings } from './team-store';
import { savePrefs, type UserPrefs } from './users';

const IDENTITIES = ['anoniem', 'gekoppeld', 'op-naam'] as const;

export async function submitPrefs(event: RequestEvent, afterSave: 'redirect' | 'stay') {
	const user = event.locals.user;
	if (!user) redirect(303, '/login');
	const form = await event.request.formData();
	const identityRaw = String(form.get('identity') ?? '');
	const identity = IDENTITIES.find((i) => i === identityRaw);
	const values = { identity: identityRaw };

	if (!identity)
		return fail(400, { ...values, error: 'Kies hoe je wijzigingen worden ondertekend' });
	if (identity === 'op-naam' && !user.session.emailVerified) {
		return fail(400, { ...values, error: 'Alleen mogelijk met een geverifieerd e-mailadres' });
	}
	if (identity === 'gekoppeld' && user.prefs.githubId === null) {
		return fail(400, { ...values, error: 'Koppel eerst je GitHub-account' });
	}

	const prefs: UserPrefs = { ...user.prefs, sub: user.session.sub, identity, onboarded: true };
	await savePrefs(prefs);
	log.info('prefs.saved', { identity, actor: actorPseudonym(user.session) });
	if (afterSave === 'redirect') redirect(303, '/');
	return { saved: true, identity };
}

/** Per site the user may see, which ways of signing it allows; the settings page explains the fallback. */
export async function siteRules(
	user: SiteUser
): Promise<{ naam: string; toegestaan: UserPrefs['identity'][] }[]> {
	const visible = await visibleSites(user);
	return Promise.all(
		getConfigStore()
			.sites()
			.filter((site) => visible.has(site.id))
			.map(async (site) => {
				const settings = await siteSettings(site);
				return { naam: settings.naam, toegestaan: settings.identiteitToegestaan };
			})
	);
}

export async function unlinkGithub(event: RequestEvent) {
	const user = event.locals.user;
	if (!user) redirect(303, '/login');
	const identity = user.prefs.identity === 'gekoppeld' ? 'anoniem' : user.prefs.identity;
	await savePrefs({ ...user.prefs, identity, githubLogin: null, githubId: null });
	log.info('auth.github_unlinked', { actor: actorPseudonym(user.session) });
	return { unlinked: true, identity };
}
