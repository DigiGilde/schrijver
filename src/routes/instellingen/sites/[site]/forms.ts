import {
	allowedKinds,
	isEmail,
	isRole,
	normaliseEmail,
	type Role,
	type SettingsValues
} from '$lib/auth/team';
import { isWebAddress } from '$lib/config/site-address';

/** How a role reads in a sentence: "is nu beheerder", "is nu lid van de redactie". */
export const ROLE_IN_SENTENCE: Record<Role, string> = {
	beheerder: 'beheerder',
	redactie: 'lid van de redactie'
};

export const NO_EMAIL_SENT = 'Schrijver stuurt geen e-mail: laat het je collega zelf weten.';

export type AddForm =
	{ ok: true; email: string; rol: Role } | { ok: false; fout: string; email: string; rol: string };

export function parseAdd(form: FormData): AddForm {
	const typed = String(form.get('email') ?? '');
	const email = normaliseEmail(typed);
	const rol = String(form.get('rol') ?? '');
	if (email === '') return { ok: false, fout: 'Een e-mailadres is nodig.', email: typed, rol };
	if (!isEmail(email)) {
		return {
			ok: false,
			fout: 'Een e-mailadres heeft de vorm naam@organisatie.nl.',
			email: typed,
			rol
		};
	}
	if (!isRole(rol)) return { ok: false, fout: 'Kies een rol.', email: typed, rol };
	return { ok: true, email, rol };
}

export type SettingsField = 'naam' | 'omschrijving' | 'adres';

export type SettingsForm =
	| { ok: true; values: SettingsValues }
	| { ok: false; fouten: Partial<Record<SettingsField, string>> };

const onOff = (value: FormDataEntryValue | null) =>
	value === 'aan' ? true : value === 'uit' ? false : null;

/** The naam, omschrijving and adres of a site, as a form sends them, with what is wrong with each. */
export function siteText(form: FormData) {
	const naam = String(form.get('naam') ?? '').trim();
	const omschrijving = String(form.get('omschrijving') ?? '').trim();
	const adres = String(form.get('adres') ?? '').trim();
	const fouten: Partial<Record<SettingsField, string>> = {};
	if (naam === '') fouten.naam = 'Een naam is nodig.';
	else if (naam.length > 100) fouten.naam = 'Een naam heeft hoogstens 100 tekens.';
	if (omschrijving.length > 300) {
		fouten.omschrijving = 'Een omschrijving heeft hoogstens 300 tekens.';
	}
	if (adres.length > 500) fouten.adres = 'Een adres heeft hoogstens 500 tekens.';
	else if (adres !== '' && !isWebAddress(adres)) {
		fouten.adres = 'Een adres begint met https:// of http://, zoals https://example.org.';
	}
	return { naam, omschrijving, adres, fouten };
}

/** Null for a request that lacks the on/off fields the page always sends. */
export function parseSettings(form: FormData): SettingsForm | null {
	const { naam, omschrijving, adres, fouten } = siteText(form);
	const mergen = onOff(form.get('mergen'));
	const vierOgen = onOff(form.get('vierOgen'));
	if (mergen === null || vierOgen === null) return null;
	if (Object.keys(fouten).length > 0) return { ok: false, fouten };

	return {
		ok: true,
		values: {
			naam,
			omschrijving: omschrijving || null,
			adres: adres || null,
			mergenVanuitSchrijver: mergen,
			vierOgen,
			identiteitToegestaan: allowedKinds(form.getAll('ondertekenen').map(String))
		}
	};
}

/** What an action of the page answers, as the components read it. */
export interface Resultaat {
	actie: 'toevoegen' | 'rol' | 'verwijderen' | 'intrekken' | 'instellingen' | 'verwijderSite';
	melding?: string;
	uitleg?: string;
	fout?: string;
	fouten?: Partial<Record<SettingsField, string>>;
	sub?: string;
	email?: string;
}
