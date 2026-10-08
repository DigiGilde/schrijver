import type { PageServerLoad } from './$types';
import { isEditorial } from '$lib/auth/editorial';
import { identitiesFor } from '$lib/auth/identity';
import { addressText } from '$lib/config/site-address';
import type { SiteConfig } from '$lib/config/types';
import { toProposal } from '$lib/forge/proposals';
import { waitsForReview } from '$lib/forge/status';
import { errorFields, log } from '$lib/log';
import { getConfigStore, getForge } from '$lib/server/services';

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
		const waiting = proposals.filter((p) => waitsForReview(p.status)).length;
		const editorial =
			waiting > 0 &&
			(await isEditorial(
				site,
				{
					email: session.email,
					emailVerified: session.emailVerified,
					githubLogin: prefs.githubLogin
				},
				forge
			));
		const lines: string[] = [];
		if (open > 0) lines.push(`Je hebt ${open} open ${open === 1 ? 'voorstel' : 'voorstellen'}`);
		if (editorial) {
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
	const sites = store.sites();
	const user = locals.user;
	const status = await Promise.all(
		sites.map((site) => (user ? statusWithin(site, user) : Promise.resolve([])))
	);
	return {
		// The detail is logged by the loader; everyone gets the same notice.
		configNotLoaded: sites.length === 0 && store.state().lastError !== null,
		sites: sites.map((s, i) => ({
			id: s.id,
			naam: s.naam,
			omschrijving: s.omschrijving,
			adres: s.adres ? addressText(s.adres) : undefined,
			status: status[i]
		}))
	};
};
