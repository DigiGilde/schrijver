import { JSDOM } from 'jsdom';
import { render } from 'svelte/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Identity } from '../../src/lib/forge/trailers';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));
vi.mock('$app/state', () => ({
	page: {
		data: { userName: 'Lezer', email: 'lezer@example.org', testEnvironment: false, site: null },
		url: new URL('http://x/')
	}
}));
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));

import { commentBody } from '../../src/lib/forge/conversation';
import type { FakeForge } from '../../src/lib/forge/fake';
import { buildFakeServices } from '../../src/lib/server/fake-mode';
import { setConfigStore, setForge } from '../../src/lib/server/services';
import { load } from '../../src/routes/sites/[site]/voorstellen/[nummer]/+page.server';
import Voorstel from '../../src/routes/sites/[site]/voorstellen/[nummer]/+page.svelte';
import { useTeams } from './team-fixture';

const REPO = 'DigiGilde/handboek';
let forge: FakeForge;

beforeAll(async () => {
	process.env.PSEUDONYM_SECRET = 'proposal-conversation-test-secret';
	const services = await buildFakeServices();
	forge = services.forge;
	setForge(forge);
	setConfigStore(services.store);
	await useTeams(services.store.sites());
});

/** The proposal page as the server renders it for someone who reads along. */
async function page(nummer: number): Promise<Document> {
	const data = await load({
		params: { site: 'digi-handboek', nummer: String(nummer) },
		url: new URL(`http://x/sites/digi-handboek/voorstellen/${nummer}`),
		locals: {
			user: {
				session: {
					sub: 'lezer',
					name: 'Lezer',
					email: 'lezer@example.org',
					emailVerified: true,
					organisation: null,
					iat: 0,
					exp: Date.now() + 60_000
				},
				prefs: {
					sub: 'lezer',
					identity: 'anoniem',
					githubLogin: null,
					githubId: null,
					onboarded: true
				}
			}
		}
	} as never);
	return new JSDOM(render(Voorstel, { props: { data } as never }).body).window.document;
}

describe('the conversation on the proposal page', () => {
	it('says under each name how its writer signed, so a name cannot pass for another kind', async () => {
		const branch = 'schrijver/digi-handboek/gesprek-aaaa';
		await forge.createBranch(REPO, 'main', branch);
		await forge.commit(REPO, branch, [{ path: 'docs/gesprek.md', content: '# Gesprek\n' }], 'x');
		const { number } = await forge.openDraftPr(REPO, branch, 'main', 'Gesprek', '');
		const reactie = (identity: Identity, role: 'schrijver' | 'redactie') =>
			forge.comment(REPO, number, commentBody('Akkoord', { identity, role, kind: 'reactie' }));
		const named = (name: string): Identity => ({ kind: 'op-naam', name, email: 'x@example.org' });
		await reactie(
			{ kind: 'gekoppeld', name: 'x', githubId: 1024025, login: 'torvalds' },
			'redactie'
		);
		await reactie(named('torvalds'), 'redactie');
		await reactie({ kind: 'anoniem', pseudoniem: '0123456789ab' }, 'schrijver');
		await reactie(named('Anoniem, codenaam 0123456789ab'), 'schrijver');
		forge.commentOnGitHub(REPO, number, 'torvalds', 'Op GitHub gezegd');

		const shown = [...(await page(number)).querySelectorAll('ol.gesprek nldd-identity')].map(
			(identity) => [
				identity.getAttribute('text'),
				identity
					.querySelector('[slot="supporting-text"]')!
					.textContent!.replace(/\s+/g, ' ')
					.replace(/ · [^·]+$/, '')
			]
		);
		expect(shown).toEqual([
			['torvalds', 'Redactie · gekoppeld aan GitHub'],
			['torvalds', 'Redactie · op naam'],
			['Anoniem, codenaam 0123456789ab', 'Schrijver van dit voorstel · anoniem'],
			['Anoniem, codenaam 0123456789ab', 'Schrijver van dit voorstel · op naam'],
			['torvalds', 'Op GitHub']
		]);
	});
});
