import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { actorPseudonym } from '$lib/auth/identity';
import { canManageSite, isPlatformAdmin } from '$lib/auth/roles';
import { isRole, type TeamChange } from '$lib/auth/team';
import { seedSites, teamStore } from '$lib/auth/team-store';
import { log } from '$lib/log';
import { getConfigStore } from '$lib/server/services';
import { NO_EMAIL_SENT, parseAdd, parseSettings, ROLE_IN_SENTENCE } from './forms';

/**
 * The site and the signed-in user, when the user may manage the site: a platform admin or a
 * beheerder of it. Anyone else gets the same 404 as for a site that does not exist.
 */
async function managed(event: RequestEvent) {
	const user = event.locals.user;
	if (!user) redirect(303, '/login');
	const site = getConfigStore().site(event.params.site ?? '');
	if (!site || !(await canManageSite(site.id, user.session)))
		error(404, 'Deze pagina bestaat niet');
	const team = teamStore();
	let settings = await team.settings(site.id);
	if (!settings) {
		await seedSites([site], team);
		settings = await team.settings(site.id);
		if (!settings) error(404, 'Deze pagina bestaat niet');
	}
	const actor = { sub: user.session.sub, platformAdmin: isPlatformAdmin(user.session.sub) };
	return { site, settings, session: user.session, team, actor };
}

type Managed = Awaited<ReturnType<typeof managed>>;

const who = (change: { name: string | null }, self: boolean) =>
	self ? 'Jij' : (change.name ?? 'Deze persoon');

/** After a change to their own place in the team, someone who no longer manages the site leaves the page. */
async function leaveWhenNoLongerManaging(m: Managed, sub: string) {
	if (sub === m.session.sub && !(await canManageSite(m.site.id, m.session))) {
		redirect(303, '/instellingen');
	}
}

function refused(m: Managed, actie: 'rol' | 'verwijderen', sub: string, change: TeamChange) {
	if (change.ok) throw new Error('not a refusal');
	if (change.reason === 'not-a-member') {
		return fail(404, { actie, sub, fout: 'Deze persoon hoort niet meer bij het team.' });
	}
	log.info('team.last_admin_refused', {
		site: m.site.id,
		action: actie,
		actor: actorPseudonym(m.session)
	});
	const self = sub === m.session.sub;
	return fail(409, {
		actie,
		sub,
		fout: `${self ? 'Je bent' : `${who(change, false)} is`} de enige beheerder van ${m.settings.naam}. Een site heeft altijd een beheerder: maak eerst iemand anders beheerder.`
	});
}

export const load: PageServerLoad = async (event) => {
	const { site, settings, session, team } = await managed(event);
	const [members, invitations] = await Promise.all([
		team.members(site.id),
		team.invitations(site.id)
	]);
	return {
		beheer: { id: site.id, naam: settings.naam, repo: site.repo },
		instellingen: {
			naam: settings.naam,
			omschrijving: settings.omschrijving ?? '',
			adres: settings.adres ?? '',
			mergenVanuitSchrijver: settings.mergenVanuitSchrijver,
			vierOgen: settings.vierOgen,
			identiteitToegestaan: settings.identiteitToegestaan
		},
		leden: members.map((m) => ({
			sub: m.sub,
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
		const m = await managed(event);
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
		const m = await managed(event);
		const form = await event.request.formData();
		const sub = String(form.get('sub') ?? '');
		const rol = form.get('rol');
		if (!isRole(rol)) return fail(400, { actie: 'rol', sub, fout: 'Kies een rol.' });
		const change = await m.team.changeRole(m.site.id, sub, rol, m.actor);
		if (!change.ok) return refused(m, 'rol', sub, change);
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
			sub,
			melding: `${who(change, self)} ${self ? 'bent' : 'is'} nu ${ROLE_IN_SENTENCE[rol]}.`
		};
	},

	verwijderen: async (event) => {
		const m = await managed(event);
		const sub = String((await event.request.formData()).get('sub') ?? '');
		const change = await m.team.removeMember(m.site.id, sub, m.actor);
		if (!change.ok) return refused(m, 'verwijderen', sub, change);
		log.info('team.member_removed', {
			site: m.site.id,
			role: change.previous,
			actor: actorPseudonym(m.session)
		});
		await leaveWhenNoLongerManaging(m, sub);
		return {
			actie: 'verwijderen',
			sub,
			melding: `${who(change, false)} hoort niet meer bij het team.`
		};
	},

	intrekken: async (event) => {
		const m = await managed(event);
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

	instellingen: async (event) => {
		const m = await managed(event);
		const parsed = parseSettings(await event.request.formData());
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
