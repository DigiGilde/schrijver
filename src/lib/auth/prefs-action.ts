import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { savePrefs, type UserPrefs } from './users';
import { log } from '../log';

const IDENTITIES = ['anoniem', 'gekoppeld', 'op-naam'] as const;
const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

type Resolved = { id: number; login: string } | 'not-found' | 'unavailable';

async function resolveGithub(login: string): Promise<Resolved> {
	if (!LOGIN_RE.test(login)) return 'not-found';
	try {
		const res = await fetch(`https://api.github.com/users/${login}`, {
			headers: { accept: 'application/vnd.github+json', 'user-agent': 'schrijver' }
		});
		if (res.status === 404) return 'not-found';
		if (!res.ok) return 'unavailable';
		const body = (await res.json()) as { id?: unknown; login?: unknown };
		if (typeof body.id !== 'number') return 'unavailable';
		return { id: body.id, login: typeof body.login === 'string' ? body.login : login };
	} catch (err) {
		log.warn('github.user_lookup_failed', { reason: err instanceof Error ? err.message : 'unknown' });
		return 'unavailable';
	}
}

export async function submitPrefs(event: RequestEvent, afterSave: 'redirect' | 'stay') {
	const user = event.locals.user;
	if (!user) redirect(303, '/login');
	const form = await event.request.formData();
	const identityRaw = String(form.get('identity') ?? '');
	const githubLogin = String(form.get('githubLogin') ?? '').trim();
	const identity = IDENTITIES.find((i) => i === identityRaw);
	const values = { identity: identityRaw, githubLogin };

	if (!identity) return fail(400, { ...values, error: 'Kies hoe je wijzigingen worden ondertekend' });
	if (identity === 'op-naam' && !user.session.emailVerified) {
		return fail(400, { ...values, error: 'Alleen mogelijk met een geverifieerd e-mailadres' });
	}

	let login: string | null = null;
	let id: number | null = null;
	if (identity === 'gekoppeld') {
		if (!githubLogin) return fail(400, { ...values, error: 'Vul je GitHub-gebruikersnaam in' });
		const resolved = await resolveGithub(githubLogin);
		if (resolved === 'not-found') return fail(400, { ...values, error: 'GitHub-gebruiker niet gevonden' });
		if (resolved === 'unavailable') {
			return fail(502, { ...values, error: 'GitHub is nu niet bereikbaar, probeer het later opnieuw' });
		}
		login = resolved.login;
		id = resolved.id;
	}

	const prefs: UserPrefs = { sub: user.session.sub, identity, githubLogin: login, githubId: id, onboarded: true };
	await savePrefs(prefs);
	if (afterSave === 'redirect') redirect(303, '/');
	return { saved: true, identity, githubLogin: login ?? '' };
}
