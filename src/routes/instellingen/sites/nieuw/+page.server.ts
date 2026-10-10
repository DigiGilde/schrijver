import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { actorPseudonym } from '$lib/auth/identity';
import { isPlatformAdmin } from '$lib/auth/roles';
import { siteSettings, teamStore } from '$lib/auth/team-store';
import { checkRepository } from '$lib/config/structure';
import type { RepoInfo } from '$lib/forge/types';
import { errorFields, log } from '$lib/log';
import { getForge, reloadSite } from '$lib/server/services';
import {
	firstAdmin,
	parseNewSite,
	repositoryName,
	suggestion,
	type Weigering
} from './nieuwe-site';

/** Only a platform admin adds a site; anyone else gets the page that does not exist. */
function platformAdmin(locals: App.Locals, action: string) {
	const user = locals.user;
	if (!user) redirect(303, '/login');
	if (!isPlatformAdmin(user.session.sub)) {
		log.warn('beheer.refused', {
			page: 'site-toevoegen',
			action,
			actor: actorPseudonym(user.session)
		});
		error(404, 'Deze pagina bestaat niet');
	}
	return user;
}

type Inspection =
	{ ok: true; repo: RepoInfo; taken: Set<string> } | { ok: false; weigering: Weigering };

/**
 * Whether a repository can become a site: its name, the App on it, no site on it yet and valid
 * `.schrijver/` files on its default branch. A lookup on GitHub that fails refuses.
 */
async function inspect(typed: string): Promise<Inspection> {
	const name = repositoryName(typed);
	if (!name) return { ok: false, weigering: { soort: 'vorm' } };
	const forge = getForge();
	const check = await checkRepository(forge, name);
	if (!check.ok && check.reason === 'not-installed') {
		const installeren = await forge.installUrl().catch(() => null);
		return { ok: false, weigering: { soort: 'niet-geinstalleerd', repo: name, installeren } };
	}
	if (!check.ok && check.reason !== 'invalid') {
		if (check.reason === 'unreachable') {
			log.warn('site.add_check_failed', errorFields(check.error));
		}
		return { ok: false, weigering: { soort: 'onbereikbaar' } };
	}
	const sites = await teamStore().sites();
	const existing = sites.find((s) => s.repoId === check.repo.id);
	if (existing) {
		const { naam } = await siteSettings(existing);
		return {
			ok: false,
			weigering: {
				soort: 'al-aangesloten',
				repo: check.repo.fullName,
				site: { id: existing.id, naam }
			}
		};
	}
	if (!check.ok) {
		return {
			ok: false,
			weigering: {
				soort: 'klopt-niet',
				repo: check.repo.fullName,
				fouten: check.errors,
				zonderMap: check.errors.every((e) => e.endsWith(': ontbreekt'))
			}
		};
	}
	return { ok: true, repo: check.repo, taken: new Set(sites.map((s) => s.id)) };
}

export const load: PageServerLoad = async ({ locals, url }) => {
	platformAdmin(locals, 'load');
	const typed = url.searchParams.get('repo');
	if (typed === null) return { stap: 1 as const, repo: '', weigering: null };
	const inspection = await inspect(typed);
	if (!inspection.ok) return { stap: 1 as const, repo: typed, weigering: inspection.weigering };
	const { repo, taken } = inspection;
	return {
		stap: 2 as const,
		repo: repo.fullName,
		branch: repo.defaultBranch,
		voorstel: suggestion(repo, taken)
	};
};

export const actions: Actions = {
	toevoegen: async ({ locals, request }) => {
		const user = platformAdmin(locals, 'toevoegen');
		const form = await request.formData();
		const inspection = await inspect(String(form.get('repo') ?? ''));
		if (!inspection.ok) return fail(409, { weigering: inspection.weigering });
		const { repo, taken } = inspection;
		const parsed = parseNewSite(form, taken);
		if (!parsed.ok) return fail(400, { fouten: parsed.fouten, waarden: parsed.waarden });

		const added = await teamStore().addSite(
			{ id: parsed.id, repoId: repo.id, repo: repo.fullName, standaardbranch: repo.defaultBranch },
			parsed.values,
			firstAdmin(parsed.admin, user.session.sub),
			user.session.sub
		);
		// Someone else took this id or this repository a moment ago.
		if (!added.ok && added.reason === 'id-taken') {
			const again = parseNewSite(form, new Set([...taken, parsed.id]));
			if (!again.ok) return fail(400, { fouten: again.fouten, waarden: again.waarden });
		}
		if (!added.ok) {
			const again = await inspect(repo.fullName);
			return fail(409, { weigering: again.ok ? { soort: 'onbereikbaar' } : again.weigering });
		}
		log.info('site.added', {
			site: parsed.id,
			admin: added.admin?.kind,
			actor: actorPseudonym(user.session)
		});
		await reloadSite(parsed.id);
		redirect(303, `/instellingen/sites/${encodeURIComponent(parsed.id)}?toegevoegd=1`);
	}
};
