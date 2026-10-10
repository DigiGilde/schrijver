import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
	startingSettings,
	type FirstAdmin,
	type LoginProfile,
	type NewSite,
	type SettingsValues,
	type TeamStore
} from '$lib/auth/team';
import { MemoryTeamStore } from '$lib/auth/team-memory';
import { useMemoryStores } from '$lib/auth/team-store';
import type { UsersStore } from '$lib/auth/users';
import { ConfigStore } from '$lib/config/load';
import { setConfigStore, setForge } from './services';
import { commentBody } from '$lib/forge/conversation';
import { FakeForge } from '$lib/forge/fake';
import { ADJUSTMENT_LABEL } from '$lib/forge/proposals';
import { identityTrailer, pseudonym } from '$lib/forge/trailers';

const ROOT = process.cwd();

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const full = join(dir, name);
		return statSync(full).isDirectory() ? walk(full) : [full];
	});
}

function seedFiles(corpus: string, prefix: string): Record<string, string> {
	const base = resolve(ROOT, 'tests/corpus', corpus);
	const files: Record<string, string> = {};
	for (const file of walk(base)) {
		if (!file.endsWith('.md')) continue;
		files[`${prefix}/${relative(base, file).split('\\').join('/')}`] = readFileSync(file, 'utf8');
	}
	return files;
}

/** The files of a repository in tests/fixtures/sites/<name>, its `.schrijver/` folder included. */
function fixtureFiles(name: string): Record<string, string> {
	const base = resolve(ROOT, 'tests/fixtures/sites', name);
	const files: Record<string, string> = {};
	for (const file of walk(base)) {
		files[relative(base, file).split('\\').join('/')] = readFileSync(file, 'utf8');
	}
	return files;
}

const MELDING_PNG =
	'iVBORw0KGgoAAAANSUhEUgAAAKAAAABaCAIAAACwpMoFAAAA4UlEQVR42u3bMQ0AIAxFweIWD0hBUBdEYAEHmOgAySXPwW0/bcTIB1v7qKQADBgwYMCAAQMGDFiABRgwYMCAAQMGDBiwAAswYMCAAQMGDBgw4Gx9qiTAgAEDBgwYMGDAgAVYgAEDBmyqNFUCBgwYsAALMGDAgAEDBgwYMGDAgAVYgAEDBgwYMGDAgAELsHwXOroDDBgwYMCAAQMWYAEGDBgwYMCmSlMlYMCAAQuwAAMGDBgwYMCAAQMWYAEGDBgwYMCAAQMGLMACDNjRnaM7wIABAwYMGDBgARZgwIABA/6iC8DQmVuP/5FYAAAAAElFTkSuQmCC';
const SCHEMA_PNG =
	'iVBORw0KGgoAAAANSUhEUgAAAKAAAABaCAIAAACwpMoFAAAA30lEQVR42u3csQ3AIAxFQbNtdmAUBqLJEKzABhkgBRVIWCe9/ku+3lGepsSFEwAWYAEWYAEWYAEGLMACLMACLMACDFiABViABViABViAAQuwAAuwAAuwfsDvmEocYMACLMACLMACLMCABViXAEftm1oM2z2z69CAHRqwQwMGDNguYLuA7QIG7NCAHRqwQwO2C9guYLuAATs0YIcG7NCAAQO2C9guYLuAATs0YIcG7NCA7QK2C9guYMAODdihATs0YLuA7QK2CxiwQ+fd9UnKIzQBFmABFmABFmDAAqwr+gABiUhNlKBpRQAAAABJRU5ErkJggg==';

/** Images on pages no other e2e test edits: one shown on a single page, one that three pages share. */
function withImages(pages: Record<string, string>): Record<string, string | Uint8Array> {
	const show = (page: string, alt: string, ref: string) => {
		pages[page] = `${pages[page]}\n![${alt}](${ref})\n`;
	};
	show(
		'docs/over/kwetsbaarheid.md',
		'Stroomschema van een melding',
		'../afbeeldingen/kwetsbaarheid/melding.png'
	);
	for (const page of [
		'docs/werkwijze/index.md',
		'docs/werkwijze/beslissingen-logboek.md',
		'docs/over/toegankelijkheid.md'
	])
		show(page, 'Schema van onze werkwijze', '../afbeeldingen/werkwijze/schema.png');
	return {
		...pages,
		'docs/afbeeldingen/kwetsbaarheid/melding.png': Buffer.from(MELDING_PNG, 'base64'),
		'docs/afbeeldingen/werkwijze/schema.png': Buffer.from(SCHEMA_PNG, 'base64')
	};
}

async function seedDraft(forge: FakeForge, repo: string, path: string, title: string) {
	const branch = 'schrijver/voorbeeld';
	await forge.createBranch(repo, 'main', branch);
	const current = forge.fileText(repo, 'main', path) ?? '';
	await forge.commit(repo, branch, [{ path, content: current + '\nAanvulling.\n' }], 'Voorbeeld');
	const body = identityTrailer({ kind: 'anoniem', pseudoniem: 'voorbeeld0000' });
	await forge.openDraftPr(repo, branch, 'main', title, body);
}

const DIGI = 'DigiGilde/handboek';
const MOZA = 'MinBZK/moza-site';
const OUD = 'DigiGilde/oude-site';
const INTERN = 'DigiGilde/intern';

/**
 * The sites of the local preview, as a platform admin added them, with the settings they have now.
 * Oude site still has the old fields in its `.schrijver/site.yaml`: only platform admins see it.
 * Werkplaats is the private repository DigiGilde/intern: only its team sees it.
 */
export const PREVIEW_SITES: {
	site: NewSite;
	settings: SettingsValues;
	admin: FirstAdmin | null;
}[] = [
	{
		site: { id: 'digi-handboek', repoId: 4101, repo: DIGI, standaardbranch: 'main' },
		settings: {
			naam: 'Digi Handboek',
			omschrijving: 'De centrale plek met de informatie die je bij het Digi Gilde nodig hebt.',
			adres: 'https://digihandboek.rijks.app/',
			mergenVanuitSchrijver: true,
			vierOgen: false,
			identiteitToegestaan: ['anoniem', 'gekoppeld', 'op-naam'],
			zichtbaarheid: 'iedereen'
		},
		admin: { email: 'test@example.org' }
	},
	{
		site: { id: 'moza-site', repoId: 4102, repo: MOZA, standaardbranch: 'main' },
		settings: {
			naam: 'MijnOverheid Zakelijk',
			omschrijving:
				'Een overheidsbrede samenwerking om de dienstverlening voor ondernemers te verbeteren.',
			adres: 'https://mijnoverheidzakelijk.nl/',
			mergenVanuitSchrijver: true,
			vierOgen: true,
			identiteitToegestaan: ['anoniem', 'gekoppeld'],
			zichtbaarheid: 'iedereen'
		},
		admin: { email: 'collega@example.org' }
	},
	{
		site: { id: 'oude-site', repoId: 4107, repo: OUD, standaardbranch: 'main' },
		settings: {
			...startingSettings('Oude site'),
			omschrijving: 'Een site die nog de oude opzet heeft.'
		},
		admin: null
	},
	{
		site: { id: 'werkplaats', repoId: 4108, repo: INTERN, standaardbranch: 'main' },
		settings: {
			...startingSettings('Werkplaats'),
			omschrijving: 'Wat het Digi Gilde alleen intern deelt.',
			zichtbaarheid: 'team'
		},
		admin: { email: 'collega@example.org' }
	}
];

/** The start page of Werkplaats, with an image only its team may see. */
const WERKPLAATS_INDEX = `---
samenvatting: Wat het team van het Digi Gilde voorbereidt.
---

# Werkplaats

Hier bereidt het team van het Digi Gilde voor wat nog niet openbaar is.

![Organogram van het Digi Gilde](afbeeldingen/organogram.png)
`;

/**
 * The repositories of the local preview: the pilot sites, Oude site, the private DigiGilde/intern of
 * Werkplaats, and five for "Site toevoegen": one that is ready, one without `.schrijver/`, one whose
 * files are not valid, one the App is not installed on, and a private one that is ready.
 */
function seedRepos(forge: FakeForge): void {
	forge.seedRepo(
		DIGI,
		'main',
		{ ...withImages(seedFiles('digi-handboek', 'docs')), ...fixtureFiles('digi-handboek') },
		{
			id: 4101,
			description: 'De centrale plek met de informatie die je bij het Digi Gilde nodig hebt.',
			homepage: 'https://digihandboek.rijks.app/'
		}
	);
	forge.seedRepo(
		MOZA,
		'main',
		{ ...seedFiles('moza-site', 'content'), ...fixtureFiles('moza-site') },
		{
			id: 4102,
			description:
				'Een overheidsbrede samenwerking om de dienstverlening voor ondernemers te verbeteren.',
			homepage: 'https://mijnoverheidzakelijk.nl/'
		}
	);
	forge.setPublic(DIGI, true);
	forge.setPublic(MOZA, true);
	forge.requireReview(MOZA);
	forge.seedRepo('DigiGilde/kennisbank', 'main', fixtureFiles('kennisbank'), {
		id: 4103,
		description: 'Wat het Digi Gilde weet over werken bij de overheid.',
		homepage: 'https://kennisbank.example.org/'
	});
	forge.setPublic('DigiGilde/kennisbank', true);
	forge.seedRepo(
		'DigiGilde/nieuwsbrief',
		'main',
		{ 'README.md': '# Nieuwsbrief\n' },
		{ id: 4104, description: 'De nieuwsbrief van het Digi Gilde.' }
	);
	forge.seedRepo('DigiGilde/intranet', 'main', fixtureFiles('intranet'), { id: 4105 });
	forge.setPublic('DigiGilde/nieuwsbrief', true);
	forge.setPublic('DigiGilde/intranet', true);
	forge.seedRepo('MinBZK/elders', 'main', fixtureFiles('kennisbank'), {
		id: 4106,
		installed: false
	});
	forge.seedRepo(OUD, 'main', fixtureFiles('oude-site'), { id: 4107 });
	forge.seedRepo(
		INTERN,
		'main',
		{
			...fixtureFiles('kennisbank'),
			'inhoud/index.md': WERKPLAATS_INDEX,
			'inhoud/afbeeldingen/organogram.png': Buffer.from(SCHEMA_PNG, 'base64')
		},
		{ id: 4108, description: 'Wat het Digi Gilde alleen intern deelt.' }
	);
	forge.seedRepo('DigiGilde/besloten', 'main', fixtureFiles('kennisbank'), {
		id: 4109,
		description: 'Wat het team van het Digi Gilde samen schrijft.'
	});
}
const COLLEAGUE = identityTrailer({ kind: 'anoniem', pseudoniem: '5ca1ab1e0000' });
const EDITOR = { kind: 'op-naam' as const, name: 'Petra de Vries', email: 'petra@example.org' };
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

async function seedProposal(
	forge: FakeForge,
	repo: string,
	opts: {
		branch: string;
		title: string;
		trailer: string;
		path: string;
		text: string;
		extra?: Record<string, string | Uint8Array>;
		sent?: boolean;
	}
): Promise<number> {
	await forge.createBranch(repo, 'main', opts.branch);
	const current = forge.fileText(repo, 'main', opts.path) ?? '';
	await forge.commit(
		repo,
		opts.branch,
		[
			{ path: opts.path, content: `${current}\n${opts.text}\n` },
			...Object.entries(opts.extra ?? {}).map(([path, content]) => ({ path, content }))
		],
		`${opts.title}\n\n${opts.trailer}`
	);
	const pr = await forge.openDraftPr(repo, opts.branch, 'main', opts.title, opts.trailer);
	if (opts.sent) await forge.markReady(repo, pr.number);
	return pr.number;
}

/** A proposal of the scenarios that is still open, so Schrijver keeps the record of who wrote it. */
export interface WrittenProposal {
	siteId: string;
	number: number;
	/** By the signed-in test user; else by the colleague who wrote the anonymous ones. */
	mine: boolean;
}

/**
 * A proposal for every state the proposal page tells apart, for the local preview and the e2e run.
 * `mine` signs the ones of the signed-in test user; without it those are left out. Returns the open
 * ones, for their writer records.
 */
export async function seedScenarios(
	forge: FakeForge,
	mine: string | null
): Promise<WrittenProposal[]> {
	const written: WrittenProposal[] = [];
	const own = mine ? identityTrailer({ kind: 'anoniem', pseudoniem: mine }) : null;
	if (own) {
		const buddy = await seedProposal(forge, DIGI, {
			branch: 'schrijver/digi-handboek/onboarding-buddy',
			title: 'Onboarding: begin bij je buddy',
			trailer: own,
			path: 'docs/onboarding/index.md',
			text: 'Je buddy helpt je de eerste weken op weg. Spreek in je eerste week af.'
		});
		const asked = await seedProposal(forge, DIGI, {
			branch: 'schrijver/digi-handboek/over-redactie',
			title: 'Over het handboek: wie de redactie is',
			trailer: own,
			path: 'docs/over/index.md',
			text: "De redactie bestaat uit drie collega's van het Digi Gilde.",
			sent: true
		});
		forge.reviewOnGitHub(DIGI, asked, 'pietersen', 'commented', '', daysAgo(2));
		await forge.addLabel(DIGI, asked, ADJUSTMENT_LABEL);
		await forge.comment(
			DIGI,
			asked,
			commentBody('Kun je de namen weglaten? Die veranderen vaak. Noem liever het e-mailadres.', {
				identity: EDITOR,
				role: 'redactie',
				kind: 'aanpassing'
			})
		);
		const contact = await seedProposal(forge, MOZA, {
			branch: 'schrijver/moza-site/toegankelijkheid-contact',
			title: 'Toegankelijkheid: wie je kunt mailen',
			trailer: own,
			path: 'content/toegankelijkheid.md',
			text: 'Loop je tegen een probleem aan? Mail de redactie, dan zoeken we het samen uit.',
			sent: true
		});
		forge.reviewOnGitHub(MOZA, contact, 'pietersen', 'approved', 'Akkoord.', daysAgo(1));
		written.push(
			{ siteId: 'digi-handboek', number: buddy, mine: true },
			{ siteId: 'digi-handboek', number: asked, mine: true },
			{ siteId: 'moza-site', number: contact, mine: true }
		);
	}

	const team = await seedProposal(forge, DIGI, {
		branch: 'schrijver/digi-handboek/kennis-team',
		title: 'Kennis: het team stelt zich voor',
		trailer: COLLEAGUE,
		path: 'docs/kennis/index.md',
		text: '![Het team bij de kick-off](../afbeeldingen/kennis/team.png)\n\nHier vind je wie wat weet.',
		extra: { 'docs/afbeeldingen/kennis/team.png': Buffer.from(MELDING_PNG, 'base64') },
		sent: true
	});
	forge.commentOnGitHub(
		DIGI,
		team,
		'jansen',
		'Mooi! Kun je ook de **mailinglijst** noemen?',
		daysAgo(1)
	);

	const merged = await seedProposal(forge, DIGI, {
		branch: 'schrijver/digi-handboek/offboarding-laptop',
		title: 'Offboarding: laptop inleveren',
		trailer: COLLEAGUE,
		path: 'docs/offboarding.md',
		text: 'Lever je laptop in bij de servicedesk op je laatste werkdag.',
		sent: true
	});
	Object.assign(forge.prs.get(merged)!, { state: 'merged', mergedAt: daysAgo(3) });

	const closed = await seedProposal(forge, DIGI, {
		branch: 'schrijver/digi-handboek/principes-oud',
		title: 'Principes: oude versie terugzetten',
		trailer: COLLEAGUE,
		path: 'docs/werkwijze/principes.md',
		text: 'Deze principes gelden niet meer.',
		sent: true
	});
	forge.prs.get(closed)!.state = 'closed';

	const weekly = await seedProposal(forge, MOZA, {
		branch: 'schrijver/moza-site/weekly-demo',
		title: 'Weekly 23 september: de demo',
		trailer: COLLEAGUE,
		path: 'content/weekly/2026/2026-09-23.md',
		text: 'Op 30 september laten we de nieuwe notificatiedienst zien.',
		sent: true
	});
	forge.commentOnGitHub(MOZA, weekly, 'jansen', 'Graag ook de tijd van de demo erbij.', daysAgo(1));
	forge.reviewOnGitHub(
		MOZA,
		weekly,
		'pietersen',
		'commented',
		'Ziet er goed uit. Klopt de datum in de tweede zin?'
	);
	written.push(
		{ siteId: 'digi-handboek', number: team, mine: false },
		{ siteId: 'moza-site', number: weekly, mine: false }
	);

	// Pages that changed on the site after the proposal was sent in: GitHub cannot merge these.
	const changedSince = async (path: string, text: string, title: string, trailer: string) => {
		const number = await seedProposal(forge, MOZA, {
			branch: `schrijver/moza-site/${path.slice(path.lastIndexOf('/') + 1, -3)}`,
			title,
			trailer,
			path,
			text,
			sent: true
		});
		const current = forge.fileText(MOZA, 'main', path) ?? '';
		await forge.commit(
			MOZA,
			'main',
			[{ path, content: `${current}\nAangevuld op de site.\n` }],
			title
		);
		return number;
	};
	written.push({
		siteId: 'moza-site',
		number: await changedSince(
			'content/weekly/2026/2026-09-10.md',
			'De agenda staat voortaan bovenaan.',
			'Weekly 10 september: de agenda',
			COLLEAGUE
		),
		mine: false
	});
	if (own) {
		written.push({
			siteId: 'moza-site',
			number: await changedSince(
				'content/weekly/2026/2026-09-03.md',
				'Een terugblik op de zomer.',
				'Weekly 3 september: de terugblik',
				own
			),
			mine: true
		});
		const onGitHub = await seedProposal(forge, MOZA, {
			branch: 'schrijver/moza-site/facilitaire-diensten',
			title: 'Facilitaire diensten: wie je belt',
			trailer: own,
			path: 'content/handboek/werkwijze/facilitaire-diensten.md',
			text: 'Voor een pas of een laptop bel je de servicedesk.',
			sent: true
		});
		forge.reviewOnGitHub(
			MOZA,
			onGitHub,
			'pietersen',
			'changes_requested',
			'Noem ook het telefoonnummer van de servicedesk.',
			daysAgo(1)
		);
		written.push({ siteId: 'moza-site', number: onGitHub, mine: true });
	}

	written.push({
		siteId: 'werkplaats',
		number: await seedProposal(forge, INTERN, {
			branch: 'schrijver/werkplaats/rooster',
			title: 'Werkplaats: het rooster van de week',
			trailer: COLLEAGUE,
			path: 'inhoud/index.md',
			text: 'Op maandag bespreken we het rooster van de week.',
			sent: true
		}),
		mine: false
	});
	return written;
}

/** The colleague of the local preview who wrote the anonymous proposals; on no team. */
const WRITER = { sub: 'vierde', name: 'Vierde Collega', email: 'vierde@example.org' };

/**
 * Records who wrote the open proposals of the scenarios, as Schrijver does at every save: the test
 * user `mine`, who has signed in, or Vierde Collega, who signs in here.
 */
export async function seedWriters(
	team: TeamStore,
	written: WrittenProposal[],
	mine: string | null
): Promise<void> {
	await team.recordLogin({ ...WRITER, emailVerified: true });
	for (const proposal of written) {
		const sub = proposal.mine ? mine : WRITER.sub;
		if (sub) await team.recordWriter(proposal.siteId, proposal.number, sub);
	}
}

/** The signed-in test user of the local preview or the e2e run, with their pseudonym. */
function testUser(): { login: LoginProfile; pseudoniem: string } | null {
	try {
		const session = JSON.parse(process.env.SCHRIJVER_TEST_SESSION ?? '');
		const secret = process.env.PSEUDONYM_SECRET;
		const sub = session?.sub;
		if (typeof sub !== 'string' || !sub || !secret) return null;
		return {
			login: {
				sub,
				name: typeof session.name === 'string' ? session.name : '',
				email: typeof session.email === 'string' ? session.email : '',
				emailVerified: session.emailVerified === true
			},
			pseudoniem: pseudonym(secret, sub)
		};
	} catch {
		return null;
	}
}

/**
 * The fake forge and the sites of the local preview, registered in `team` (a fresh store in memory
 * unless given) by the platform admin.
 */
export async function buildFakeServices(
	team: TeamStore = new MemoryTeamStore()
): Promise<{ forge: FakeForge; store: ConfigStore; team: TeamStore }> {
	const forge = new FakeForge();
	seedRepos(forge);
	await seedDraft(forge, DIGI, 'docs/index.md', 'Voorbeeldvoorstel Digi Handboek');
	await seedDraft(forge, MOZA, 'content/contact.md', 'Voorbeeldvoorstel MOZa-site');
	for (const { site, settings, admin } of PREVIEW_SITES) {
		await team.addSite(site, settings, admin, 'platform');
	}
	const store = new ConfigStore(team, () => forge);
	await store.load();
	return { forge, store, team };
}

/** Known colleagues of the local preview, each signed in once. */
const COLLEAGUES = [
	{ sub: 'collega', name: 'Tweede Collega', email: 'collega@example.org' },
	{ sub: 'derde', name: 'Derde Collega', email: 'derde@example.org' },
	{ sub: 'platform', name: 'Beheerder Schrijver', email: 'platform@example.org' }
];

/**
 * Known colleagues: Tweede Collega as the beheerder of MOZa and Werkplaats, Derde Collega in the
 * redactie of MOZa and outside Werkplaats, and Beheerder Schrijver on no team (the platform admin of
 * the e2e run). Invitations make the test user (test@example.org) beheerder of Digi Handboek, redactie
 * of MOZa and bijdrager of Werkplaats at its login; two more stay open.
 */
export async function seedFakeTeam(users: UsersStore, team: TeamStore): Promise<void> {
	for (const { sub, name, email } of COLLEAGUES) {
		await team.recordLogin({ sub, name, email, emailVerified: true });
		await users.savePrefs({
			sub,
			identity: 'anoniem',
			githubLogin: null,
			githubId: null,
			onboarded: true
		});
	}
	await team.addByEmail('moza-site', 'derde@example.org', 'redactie', 'collega');
	await team.addByEmail('moza-site', 'test@example.org', 'redactie', 'collega');
	await team.addByEmail('moza-site', 'redactie@example.org', 'redactie', 'collega');
	await team.addByEmail('digi-handboek', 'naam@rijksoverheid.nl', 'redactie', 'platform');
	await team.addByEmail('werkplaats', 'test@example.org', 'bijdrager', 'collega');
}

export async function initFakeServices(): Promise<void> {
	const { users, team } = useMemoryStores();
	const { forge, store } = await buildFakeServices(team);
	const tester = testUser();
	const written = await seedScenarios(forge, tester?.pseudoniem ?? null);
	setForge(forge);
	setConfigStore(store);
	await seedFakeTeam(users, team);
	// Its first request signs the test user in too; a writer record needs the profile now.
	if (tester) await team.recordLogin(tester.login);
	await seedWriters(team, written, tester?.login.sub ?? null);
}
