import {
	isEmail,
	isVisibility,
	normaliseEmail,
	startingSettings,
	type FirstAdmin,
	type SettingsValues,
	type Visibility
} from '$lib/auth/team';
import { isWebAddress } from '$lib/config/site-address';
import type { RepoInfo } from '$lib/forge/types';
import { siteText, type SettingsField } from '../[site]/forms';

const OWNER = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})';
const NAME = '[A-Za-z0-9._-]{1,100}';

/** owner/name from what someone typed: the name itself, or the address of the repository on GitHub. */
export function repositoryName(typed: string): string | null {
	const value = typed.trim();
	const url = new RegExp(`^https://github\\.com/(${OWNER})/(${NAME}?)(?:\\.git)?/?$`, 'i').exec(
		value
	);
	const name = url ? `${url[1]}/${url[2]}` : value.replace(/\.git$/i, '');
	if (!new RegExp(`^${OWNER}/${NAME}$`).test(name)) return null;
	return /\/\.{1,2}$/.test(name) ? null : name;
}

/** The slug of a site: lower case letters and digits, with single hyphens between them. */
export const SITE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SITE_ID_MAX = 50;
/** Addresses under /instellingen/sites/ that a site cannot take. */
const RESERVED = new Set(['nieuw']);

export const ID_TAKEN = 'Er is al een site met deze naam in het adres. Kies een andere.';

/** The id a site gets unless someone types another: from the name of its repository, not one in use. */
export function suggestedId(repo: string, taken: Set<string>): string {
	const base =
		repo
			.split('/')[1]
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[̀-ͯ]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.slice(0, SITE_ID_MAX - 3)
			.replace(/^-+|-+$/g, '') || 'site';
	let id = base;
	for (let n = 2; taken.has(id) || RESERVED.has(id); n++) id = `${base}-${n}`;
	return id;
}

/**
 * What step 2 starts with: an id, a name, description and address from GitHub, and who sees the site:
 * everyone who signs in, unless the repository is not public.
 */
export function suggestion(repo: RepoInfo, taken: Set<string>) {
	const words = repo.fullName
		.split('/')[1]
		.replace(/[-_.]+/g, ' ')
		.trim();
	const homepage = repo.homepage?.trim() ?? '';
	return {
		id: suggestedId(repo.fullName, taken),
		naam: (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, 100),
		omschrijving: (repo.description ?? '').trim().slice(0, 300),
		adres: homepage.length <= 500 && isWebAddress(homepage) ? homepage : '',
		beheerder: 'ik' as 'ik' | 'collega',
		email: '',
		zichtbaarheid: (repo.isPublic ? 'iedereen' : 'team') as Visibility
	};
}

/** Why a repository cannot become a site, as step 1 says it. */
export type Weigering =
	| { soort: 'vorm' }
	| { soort: 'niet-geinstalleerd'; repo: string; installeren: string | null }
	| { soort: 'onbereikbaar' }
	| { soort: 'al-aangesloten'; repo: string; site: { id: string; naam: string } }
	| { soort: 'klopt-niet'; repo: string; fouten: string[]; zonderMap: boolean }
	/** The name leads to another repository than the one step 1 showed. */
	| { soort: 'veranderd'; repo: string };

export type NewSiteField = SettingsField | 'id' | 'email' | 'zichtbaarheid';
export type NewSiteValues = ReturnType<typeof suggestion>;

/** Step 2 as it was typed, to show again with a refusal. */
export type NewSiteForm =
	| {
			ok: true;
			id: string;
			values: SettingsValues;
			admin: 'ik' | { email: string };
			waarden: NewSiteValues;
	  }
	| { ok: false; fouten: Partial<Record<NewSiteField, string>>; waarden: NewSiteValues };

export const ADMIN_UNKNOWN =
	'Deze collega heeft nog niet ingelogd bij Schrijver. Alleen het team ziet deze site: kies jezelf als eerste beheerder, of een collega die al eens heeft ingelogd.';

/**
 * Step 2 as the form sends it, checked on the server. A repository that is not public is seen by its
 * team only, whatever the form says.
 */
export function parseNewSite(form: FormData, taken: Set<string>, isPublic: boolean): NewSiteForm {
	const { naam, omschrijving, adres, fouten } = siteText(form);
	const id = String(form.get('id') ?? '').trim();
	const beheerder = form.get('beheerder') === 'collega' ? 'collega' : 'ik';
	const typed = String(form.get('email') ?? '');
	const email = normaliseEmail(typed);
	const chosen = isPublic ? form.get('zichtbaarheid') : 'team';
	const errors: Partial<Record<NewSiteField, string>> = { ...fouten };
	if (!isVisibility(chosen)) errors.zichtbaarheid = 'Kies wie de site ziet.';
	const zichtbaarheid: Visibility = isVisibility(chosen) ? chosen : 'iedereen';

	if (id === '') errors.id = 'Een naam in het adres is nodig.';
	else if (id.length > SITE_ID_MAX)
		errors.id = `Een naam in het adres heeft hoogstens ${SITE_ID_MAX} tekens.`;
	else if (!SITE_ID.test(id)) {
		errors.id =
			'Een naam in het adres heeft kleine letters en cijfers, met streepjes ertussen, zoals kennisbank.';
	} else if (RESERVED.has(id))
		errors.id = 'Deze naam in het adres gebruikt Schrijver zelf. Kies een andere.';
	else if (taken.has(id)) errors.id = ID_TAKEN;

	if (beheerder === 'collega') {
		if (email === '') errors.email = 'Een e-mailadres is nodig.';
		else if (!isEmail(email)) errors.email = 'Een e-mailadres heeft de vorm naam@organisatie.nl.';
	}

	const waarden: NewSiteValues = {
		id,
		naam,
		omschrijving,
		adres,
		beheerder,
		email: typed,
		zichtbaarheid
	};
	if (Object.keys(errors).length > 0) return { ok: false, fouten: errors, waarden };
	return {
		ok: true,
		waarden,
		id,
		values: {
			...startingSettings(naam),
			omschrijving: omschrijving || null,
			adres: adres || null,
			zichtbaarheid
		},
		admin: beheerder === 'ik' ? 'ik' : { email }
	};
}

/**
 * The first beheerder as the registry takes it: the platform admin by sub, or an address. Of a site
 * only its team sees, a colleague who gets in at once: nobody else could let them in.
 */
export const firstAdmin = (
	admin: 'ik' | { email: string },
	sub: string,
	teamOnly: boolean
): FirstAdmin => (admin === 'ik' ? { sub } : teamOnly ? { ...admin, known: true } : admin);
