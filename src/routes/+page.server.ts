import type { PageServerLoad } from './$types';
import { isEditorial } from '$lib/auth/editorial';
import { identitiesFor } from '$lib/auth/identity';
import { managedSites } from '$lib/auth/roles';
import { siteSettings } from '$lib/auth/team-store';
import { addressText } from '$lib/config/site-address';
import type { SiteConfig } from '$lib/config/types';
import { toProposal } from '$lib/forge/proposals';
import { forReview, waitsForReview } from '$lib/forge/status';
import { errorFields, log } from '$lib/log';
import { getConfigStore, getForge } from '$lib/server/services';
import { ownForReview } from '$lib/server/site-tabs';

/** The status lines are a courtesy: a slow forge must not hold up the start page. */
const STATUS_TIMEOUT_MS = 2000;

type User = NonNullable<App.Locals['user']>;

async function statusLines(site: SiteConfig, { session, prefs }: User): Promise<string[]> {
	try {
		const forge = getForge();
		const mine = identitiesFor(prefs, session);
		const prs = await forge.listPrs(site.repo, 'open');
		// Counting needs no file lists.
		const proposals = prs.map((pr) => toProposal(pr, [], site, mine));
		const open = proposals.filter((p) => p.mine).length;
		const user = { sub: session.sub, githubLogin: prefs.githubLogin };
		const editorial =
			proposals.some((p) => waitsForReview(p.status)) && (await isEditorial(site, user, forge));
		const waiting = editorial
			? forReview(proposals, await ownForReview(site, user, forge, proposals)).length
			: 0;
		const lines: string[] = [];
		if (open > 0) lines.push(`Je hebt ${open} open ${open === 1 ? 'voorstel' : 'voorstellen'}`);
		if (waiting > 0) {
			lines.push(
				waiting === 1
					? '1 voorstel wacht op beoordeling'
					: `${waiting} voorstellen wachten op beoordeling`
			);
		}
		return lines;
	} catch (err) {
		log.warn('home.status_failed', { site: site.id, ...errorFields(err) });
		return [];
	}
}

async function statusWithin(site: SiteConfig, user: User): Promise<string[]> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<string[]>((resolve) => {
		timer = setTimeout(() => {
			log.warn('home.status_timeout', { site: site.id });
			resolve([]);
		}, STATUS_TIMEOUT_MS);
	});
	try {
		return await Promise.race([statusLines(site, user), late]);
	} finally {
		clearTimeout(timer);
	}
}

export const load: PageServerLoad = async ({ locals }) => {
	const store = getConfigStore();
	const statuses = store.statuses();
	const user = locals.user;
	// Only a site with a problem asks who manages it: its admins see the problem, and a site nobody
	// can edit only them.
	const troubled = statuses.filter((s) => s.errors.length > 0).map((s) => s.site);
	const asker = user && { sub: user.session.sub, githubLogin: user.prefs.githubLogin };
	const beheerd = new Set(asker ? await managedSites(troubled, asker, getForge()) : []);
	const shown = statuses.filter((s) => s.available || beheerd.has(s.site.id));
	const [settings, status] = await Promise.all([
		Promise.all(shown.map((s) => siteSettings(s.site))),
		Promise.all(
			shown.map((s) => {
				const site = store.site(s.site.id);
				return user && site ? statusWithin(site, user) : Promise.resolve([]);
			})
		)
	]);
	return {
		// The detail is logged by the loader; everyone gets the same notice.
		configNotLoaded: statuses.length === 0 && store.state().lastError !== null,
		sites: shown.map((s, i) => ({
			id: s.site.id,
			naam: settings[i].naam,
			omschrijving: settings[i].omschrijving,
			adres: settings[i].adres ? addressText(settings[i].adres) : undefined,
			status: status[i],
			beschikbaar: s.available,
			klopNiet: beheerd.has(s.site.id)
		}))
	};
};
