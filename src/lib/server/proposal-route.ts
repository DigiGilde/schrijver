import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { SiteConfig } from '$lib/config/types';
import { actorPseudonym, identitiesFor, identityFor } from '$lib/auth/identity';
import type { SiteSettings } from '$lib/auth/team';
import { siteSettings } from '$lib/auth/team-store';
import { canAct, type ActingUser } from '$lib/forge/proposal-actions';
import type { Identity } from '$lib/forge/trailers';
import { ForgeError, type Forge, type PrSummary } from '$lib/forge/types';
import { log } from '$lib/log';
import { getConfigStore, getForge } from './services';

export const refuse = (status: number, message: string, detail?: string) =>
	json({ ok: false, message, ...(detail ? { detail } : {}) }, { status });

export interface ProposalContext {
	site: SiteConfig;
	settings: SiteSettings;
	forge: Forge;
	pr: PrSummary;
	acts: { owner: boolean; editorial: boolean };
	user: ActingUser;
	/** How the user signs on this site. */
	identity: Identity;
}

type Handler = (ctx: ProposalContext, event: RequestEvent) => Promise<Response>;

export function proposalAction(action: string, handler: Handler) {
	return async (event: RequestEvent): Promise<Response> => {
		const { locals, params } = event;
		const current = locals.user;
		if (!current) return refuse(401, 'Niet ingelogd');
		const site = getConfigStore().site(params.site!);
		const nummer = Number(params.nummer);
		if (!site || !Number.isInteger(nummer) || nummer <= 0)
			return refuse(404, 'Voorstel niet gevonden');
		const forge = getForge();
		try {
			const pr = await forge.getPr(site.repo, nummer);
			const settings = await siteSettings(site);
			const identity = identityFor(current.prefs, current.session, settings);
			const user: ActingUser = {
				sub: current.session.sub,
				identities: identitiesFor(current.prefs, current.session),
				githubLogin: current.prefs.githubLogin,
				identityKind: identity.kind
			};
			const acts = await canAct(user, site, pr, forge);
			const response = await handler({ site, settings, forge, pr, acts, user, identity }, event);
			if (response.ok)
				log.info(`proposal.${action}`, {
					site: site.id,
					pr: nummer,
					actor: actorPseudonym(current.session)
				});
			return response;
		} catch (e) {
			if (e instanceof ForgeError) {
				if (e.status === 404) return refuse(404, 'Voorstel niet gevonden');
				log.warn(`proposal.${action}_failed`, {
					site: site.id,
					pr: nummer,
					status: e.status,
					actor: actorPseudonym(current.session)
				});
				return refuse(e.status, e.message, e.detail);
			}
			throw e;
		}
	};
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
	try {
		const body = await request.json();
		return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
	} catch {
		return null;
	}
}
