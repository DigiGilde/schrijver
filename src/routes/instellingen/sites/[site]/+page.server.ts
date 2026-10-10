import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { actorPseudonym, memberKey } from '$lib/auth/identity';
import { canManageSite, isPlatformAdmin } from '$lib/auth/roles';
import { isRole, type TeamChange } from '$lib/auth/team';
import { siteSettings, teamStore } from '$lib/auth/team-store';
import { whoSees } from '$lib/auth/visibility';
import type { SiteConfig } from '$lib/config/types';
import { log } from '$lib/log';
import { limitBeheerPost } from '$lib/server/security';
import { getConfigStore, getForge, reloadSite } from '$lib/server/services';
import { NO_EMAIL_SENT, parseAdd, parseSettings, ROLE_IN_SENTENCE } from './forms';

/**
 * The site and the signed-in user, when the user may manage the site: a platform admin or a
 * beheerder of it. Anyone else gets the same 404 as for a site that does not exist. A site whose
 * files are not valid is managed here too.
 */
async function managed(event: RequestEvent, action: string) {
	const user = event.locals.user;
	if (!user) redirect(303, '/login');
	if (action !== 'load') limitBeheerPost(user.session.sub);
	const status = getConfigStore().status(event.params.site ?? '');
	const asker = { sub: user.session.sub, githubLogin: user.prefs.githubLogin };
	if (!status || !(await canManageSite(status.site, asker, getForge()))) {
		log.warn('beheer.refused', {
			page: 'beheer',
			site: status?.site.id ?? null,
			action,
			actor: actorPseudonym(user.session)
		});
		error(404, 'Deze pagina bestaat niet');
	}
	const site = status.site;
	const team = teamStore();
	const settings = await siteSettings(site, team);
	const actor = { sub: user.session.sub, platformAdmin: isPlatformAdmin(user.session.sub) };
	return { site, status, settings, session: user.session, asker, team, actor };
}

/** Who sees the site, and whether its admins choose it: only while its repository is public. */
const visibility = (m: Managed) => ({
	zichtbaarheid: whoSees(m.status.isPublic, m.settings.zichtbaarheid),
	openbaar: m.status.isPublic
});

const PREVIEW: Record<SiteConfig['preview']['soort'], string> = {
	'bij-push': 'Bij elke keer bewaren',
	'bij-label': 'Na insturen',
	geen: 'Geen voorbeeld'
};

/** What `.schrijver/` says, as its admins read it; null for a site without a valid structure. */
function structure(siteId: string) {
	const store = getConfigStore();
	const site = store.site(siteId);
	if (!site) return null;
	const schema = store.schema(siteId);
	const nieuw = schema['nieuwe-pagina'];
	return {
		paginas: `${site.content.pad || '.'}/${site.content.patroon}`,
		uitsluiten: site.content.uitsluiten ?? [],
		afbeeldingen: site.content.afbeeldingen?.pad ?? null,
		voorbeeld: PREVIEW[site.preview.soort],
		nieuwePaginas: 'soorten' in nieuw ? nieuw.soorten.map((s) => s.naam) : nieuw.mappen,
		schrijfwijzer: store.schrijfwijzer(siteId) !== ''
	};
}

type Managed = Awaited<ReturnType<typeof managed>>;

const who = (change: { name: string | null }, self: boolean) =>
	self ? 'Jij' : (change.name ?? 'Deze persoon');

/** After a change to their own place in the team, someone who no longer manages the site leaves the page. */
async function leaveWhenNoLongerManaging(m: Managed, sub: string) {
	if (sub === m.session.sub && !(await canManageSite(m.site, m.asker, getForge()))) {
		redirect(303, '/instellingen');
	}
}

const GONE = 'Deze persoon hoort niet meer bij het team.';

/** The sub of the member whose key a form sends back; null when nobody on the team has that key. */
async function memberOf(m: Managed, sleutel: string): Promise<string | null> {
	const members = await m.team.members(m.site.id);
	return members.find((member) => memberKey(m.site.id, member.sub) === sleutel)?.sub ?? null;
}

function refused(
	m: Managed,
	actie: 'rol' | 'verwijderen',
	sleutel: string,
	sub: string,
	change: TeamChange
) {
	if (change.ok) throw new Error('not a refusal');
	if (change.reason === 'not-a-member') return fail(404, { actie, sleutel, fout: GONE });
	log.info('team.last_admin_refused', {
		site: m.site.id,
		action: actie,
		actor: actorPseudonym(m.session)
	});
	const self = sub === m.session.sub;
	return fail(409, {
		actie,
		sleutel,
		fout: `${self ? 'Je bent' : `${who(change, false)} is`} de enige beheerder van ${m.settings.naam}. Een site heeft altijd een beheerder: maak eerst iemand anders beheerder.`
	});
}

export const load: PageServerLoad = async (event) => {
	const m = await managed(event, 'load');
	const { site, status, settings, session, team, actor } = m;
	const [members, invitations] = await Promise.all([
		team.members(site.id),
		team.invitations(site.id)
	]);
	const branch = site.standaardbranch.split('/').map(encodeURIComponent).join('/');
	return {
		beheer: { id: site.id, naam: settings.naam },
		toegevoegd: event.url.searchParams.get('toegevoegd') === '1',
		structuur: {
			bruikbaar: status.available,
			fouten: status.errors,
			url: `https://github.com/${site.repo}/tree/${branch}/.schrijver`,
			samenvatting: structure(site.id)
		},
		magVerwijderen: actor.platformAdmin,
		...visibility(m),
		instellingen: {
			naam: settings.naam,
			omschrijving: settings.omschrijving ?? '',
			adres: settings.adres ?? '',
			mergenVanuitSchrijver: settings.mergenVanuitSchrijver,
			vierOgen: settings.vierOgen,
			identiteitToegestaan: settings.identiteitToegestaan,
			zichtbaarheid: settings.zichtbaarheid
		},
		leden: members.map((m) => ({
			sleutel: memberKey(site.id, m.sub),
			naam: m.name,
			email: m.email,
			rol: m.role,
			sinds: m.addedAt.toISOString(),
			jij: m.sub === session.sub
		})),
		uitnodigingen: invitations.map((i) => ({
			id: i.id,
			email: i.email,
			rol: i.role,
			verloopt: i.expiresAt.toISOString()
		}))
	};
};

export const actions: Actions = {
	toevoegen: async (event) => {
		const m = await managed(event, 'toevoegen');
		const parsed = parseAdd(await event.request.formData());
		if (!parsed.ok) {
			return fail(400, { actie: 'toevoegen', fout: parsed.fout, email: parsed.email });
		}
		const result = await m.team.addByEmail(m.site.id, parsed.email, parsed.rol, m.actor.sub);
		log.info('team.add', {
			site: m.site.id,
			result: result.kind,
			role: parsed.rol,
			actor: actorPseudonym(m.session)
		});
		const rol = ROLE_IN_SENTENCE[parsed.rol];
		if (result.kind === 'added') {
			return {
				actie: 'toevoegen',
				melding: `${result.name ?? parsed.email} hoort nu bij het team, als ${rol}.`,
				uitleg: NO_EMAIL_SENT
			};
		}
		if (result.kind === 'already-member') {
			return {
				actie: 'toevoegen',
				melding: `${result.name ?? parsed.email} hoort al bij het team, als ${ROLE_IN_SENTENCE[result.role]}.`,
				uitleg: 'Een andere rol kies je bij de naam in de lijst.'
			};
		}
		return {
			actie: 'toevoegen',
			melding: result.renewed
				? `De uitnodiging voor ${parsed.email} is vernieuwd, als ${rol}.`
				: `${parsed.email} is uitgenodigd als ${rol}.`,
			uitleg: `Wie met dit e-mailadres inlogt, hoort daarna bij het team. De uitnodiging geldt 30 dagen. ${NO_EMAIL_SENT}`
		};
	},

	rol: async (event) => {
		const m = await managed(event, 'rol');
		const form = await event.request.formData();
		const sleutel = String(form.get('sleutel') ?? '');
		const rol = form.get('rol');
		if (!isRole(rol)) return fail(400, { actie: 'rol', sleutel, fout: 'Kies een rol.' });
		const sub = await memberOf(m, sleutel);
		if (sub === null) return fail(404, { actie: 'rol', sleutel, fout: GONE });
		const change = await m.team.changeRole(m.site.id, sub, rol, m.actor);
		if (!change.ok) return refused(m, 'rol', sleutel, sub, change);
		if (change.previous !== rol) {
			log.info('team.role_changed', {
				site: m.site.id,
				role: rol,
				actor: actorPseudonym(m.session)
			});
		}
		await leaveWhenNoLongerManaging(m, sub);
		const self = sub === m.session.sub;
		return {
			actie: 'rol',
			sleutel,
			melding: `${who(change, self)} ${self ? 'bent' : 'is'} nu ${ROLE_IN_SENTENCE[rol]}.`
		};
	},

	verwijderen: async (event) => {
		const m = await managed(event, 'verwijderen');
		const sleutel = String((await event.request.formData()).get('sleutel') ?? '');
		const sub = await memberOf(m, sleutel);
		if (sub === null) return fail(404, { actie: 'verwijderen', sleutel, fout: GONE });
		const change = await m.team.removeMember(m.site.id, sub, m.actor);
		if (!change.ok) return refused(m, 'verwijderen', sleutel, sub, change);
		log.info('team.member_removed', {
			site: m.site.id,
			role: change.previous,
			actor: actorPseudonym(m.session)
		});
		await leaveWhenNoLongerManaging(m, sub);
		return {
			actie: 'verwijderen',
			sleutel,
			melding: `${who(change, false)} hoort niet meer bij het team.`
		};
	},

	intrekken: async (event) => {
		const m = await managed(event, 'intrekken');
		const id = String((await event.request.formData()).get('id') ?? '');
		const revoked = await m.team.revokeInvitation(m.site.id, id, m.actor.sub);
		if (!revoked) {
			return fail(404, { actie: 'intrekken', fout: 'Deze uitnodiging bestaat niet meer.' });
		}
		log.info('team.invitation_revoked', {
			site: m.site.id,
			role: revoked.role,
			actor: actorPseudonym(m.session)
		});
		return {
			actie: 'intrekken',
			melding: `De uitnodiging voor ${revoked.email} is ingetrokken.`
		};
	},

	verwijderSite: async (event) => {
		const m = await managed(event, 'verwijderSite');
		if (!m.actor.platformAdmin) {
			log.warn('beheer.refused', {
				page: 'beheer',
				site: m.site.id,
				action: 'verwijderSite',
				actor: actorPseudonym(m.session)
			});
			return fail(403, {
				actie: 'verwijderSite',
				fout: 'Alleen een beheerder van Schrijver haalt een site uit Schrijver.'
			});
		}
		if (!(await m.team.removeSite(m.site.id, m.actor.sub))) error(404, 'Deze pagina bestaat niet');
		log.info('site.removed', { site: m.site.id, actor: actorPseudonym(m.session) });
		await reloadSite(m.site.id);
		redirect(303, '/instellingen?verwijderd=1');
	},

	instellingen: async (event) => {
		const m = await managed(event, 'instellingen');
		// While the repository is not public the choice is not the admins': what they chose before stays.
		const fixed = m.status.isPublic === true ? null : m.settings.zichtbaarheid;
		const parsed = parseSettings(await event.request.formData(), fixed);
		if (!parsed) return fail(400, { actie: 'instellingen', fout: 'Ongeldige aanvraag.' });
		if (!parsed.ok) {
			return fail(400, {
				actie: 'instellingen',
				fout: 'Niet alles klopt. Kijk de velden met een melding na.',
				fouten: parsed.fouten
			});
		}
		const changed = await m.team.saveSettings(m.site.id, parsed.values, m.actor.sub);
		if (changed.length > 0) {
			log.info('team.settings_saved', {
				site: m.site.id,
				changed,
				actor: actorPseudonym(m.session)
			});
		}
		return { actie: 'instellingen', melding: 'De instellingen van de site zijn bewaard.' };
	}
};
