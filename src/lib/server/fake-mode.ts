import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ConfigStore, type ConfigReader } from '$lib/config/load';
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

/**
 * A proposal for every state the proposal page tells apart, for the local preview and the e2e run.
 * `mine` signs the ones of the signed-in test user; without it those are left out.
 */
export async function seedScenarios(forge: FakeForge, mine: string | null): Promise<void> {
	const own = mine ? identityTrailer({ kind: 'anoniem', pseudoniem: mine }) : null;
	if (own) {
		await seedProposal(forge, DIGI, {
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
		await forge.setLabels(DIGI, asked, [ADJUSTMENT_LABEL]);
		await forge.comment(
			DIGI,
			asked,
			commentBody('Kun je de namen weglaten? Die veranderen vaak. Noem liever het e-mailadres.', {
				identity: EDITOR,
				role: 'redactie',
				kind: 'aanpassing'
			})
		);
		await seedProposal(forge, MOZA, {
			branch: 'schrijver/moza-site/toegankelijkheid-contact',
			title: 'Toegankelijkheid: wie je kunt mailen',
			trailer: own,
			path: 'content/toegankelijkheid.md',
			text: 'Loop je tegen een probleem aan? Mail de redactie, dan zoeken we het samen uit.',
			sent: true
		});
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
}

/** The pseudonym of the signed-in test user, when the local preview or the e2e run has one. */
function testUserPseudonym(): string | null {
	try {
		const sub = JSON.parse(process.env.SCHRIJVER_TEST_SESSION ?? '').sub;
		const secret = process.env.PSEUDONYM_SECRET;
		return typeof sub === 'string' && sub && secret ? pseudonym(secret, sub) : null;
	} catch {
		return null;
	}
}

function fixtureReader(): ConfigReader {
	const base = resolve(ROOT, 'tests/fixtures/config');
	return {
		async readFile(path) {
			try {
				const text = readFileSync(join(base, path), 'utf8');
				return path === 'sites.yaml'
					? text.replace(
							'- naam@rijksoverheid.nl',
							'- naam@rijksoverheid.nl\n      - test@example.org'
						)
					: text;
			} catch {
				return null;
			}
		},
		async listFiles(dir) {
			try {
				return walk(join(base, dir)).map((f) => relative(join(base, dir), f));
			} catch {
				return [];
			}
		}
	};
}

export async function buildFakeServices(): Promise<{ forge: FakeForge; store: ConfigStore }> {
	const forge = new FakeForge();
	forge.seedRepo('DigiGilde/handboek', 'main', withImages(seedFiles('digi-handboek', 'docs')));
	forge.seedRepo('MinBZK/moza-site', 'main', seedFiles('moza-site', 'content'));
	forge.setPublic('DigiGilde/handboek', true);
	forge.setPublic('MinBZK/moza-site', true);
	forge.requireReview('MinBZK/moza-site');
	await seedDraft(forge, 'DigiGilde/handboek', 'docs/index.md', 'Voorbeeldvoorstel Digi Handboek');
	await seedDraft(forge, 'MinBZK/moza-site', 'content/contact.md', 'Voorbeeldvoorstel MOZa-site');
	const store = new ConfigStore(fixtureReader());
	await store.load();
	return { forge, store };
}

export async function initFakeServices(): Promise<void> {
	const { forge, store } = await buildFakeServices();
	await seedScenarios(forge, testUserPseudonym());
	setForge(forge);
	setConfigStore(store);
}
