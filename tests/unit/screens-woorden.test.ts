import { JSDOM } from 'jsdom';
import type { Component } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	page: {
		data: { userName: 'Lezer', email: 'lezer@example.org', testEnvironment: false, site: null },
		url: new URL('http://x/'),
		status: 200,
		error: null as { message: string; id?: string } | null
	}
}));
vi.mock('$app/state', () => state);

import ConceptBanner from '../../src/lib/components/ConceptBanner.svelte';
import Diff from '../../src/lib/components/Diff.svelte';
import LeesAlleenBanner from '../../src/lib/components/LeesAlleenBanner.svelte';
import PrefsForm from '../../src/lib/components/PrefsForm.svelte';
import Structuur from '../../src/routes/instellingen/sites/[site]/Structuur.svelte';
import GitHubStart from '../../src/routes/login/github/start/+page.svelte';
import Over from '../../src/routes/sites/[site]/over/+page.svelte';
import Foutpagina from '../../src/routes/+error.svelte';
import Startpagina from '../../src/routes/+page.svelte';
import Uitgelogd from '../../src/routes/uitgelogd/+page.svelte';

function screen(component: Component<any>, props: Record<string, unknown> = {}) {
	return new JSDOM(render(component, { props }).body).window.document;
}

describe('the start page', () => {
	it('sends a colleague without sites to a beheerder of Schrijver, who adds the site', () => {
		const document = screen(Startpagina, { data: { configNotLoaded: false, sites: [] } });
		expect(document.querySelector('nldd-inline-dialog')?.getAttribute('supporting-text')).toBe(
			'Vraag een beheerder van Schrijver om je site toe te voegen.'
		);
	});

	it('says that the sites could not be loaded, and who to tell', () => {
		const document = screen(Startpagina, { data: { configNotLoaded: true, sites: [] } });
		const banner = document.querySelector('nldd-banner')!;
		expect(banner.getAttribute('text')).toBe('Sites niet geladen');
		expect(banner.getAttribute('supporting-text')).toBe(
			'Schrijver probeert het elke minuut opnieuw. Blijft dit zo, meld het dan bij een beheerder van Schrijver.'
		);
	});
});

describe('the error page', () => {
	it('names the reference of an error as a foutkenmerk, for a beheerder of Schrijver', () => {
		state.page.status = 500;
		state.page.error = { message: 'Er ging iets mis', id: 'abc-123' };
		const document = screen(Foutpagina);
		expect(document.body.textContent).toContain(
			'Foutkenmerk voor een beheerder van Schrijver: abc-123'
		);
		expect(document.body.textContent).not.toMatch(/Kenmerk voor de beheerders/);
	});
});

describe('after signing out', () => {
	it('says uitgelogd at SSO Rijk too, and offers to finish the sign-out there', () => {
		const document = screen(Uitgelogd, { data: { endSession: 'https://sso.example/uitloggen' } });
		expect(document.querySelector('nldd-text')?.textContent).toBe(
			'Je wordt nu ook uitgelogd bij SSO Rijk.'
		);
		const link = document.querySelector('a[href="https://sso.example/uitloggen"]');
		expect(link?.textContent).toBe('Uitloggen bij SSO Rijk');
		expect(document.body.textContent).not.toMatch(/afgemeld|Meld je af/);
	});
});

describe('the banner for the text this browser remembers', () => {
	it('calls it niet-bewaarde tekst, not a concept, and offers to restore or discard it', () => {
		const banner = screen(ConceptBanner, {
			verouderd: true,
			onherstel: () => {},
			onweggooien: () => {}
		}).querySelector('nldd-banner')!;
		expect(banner.getAttribute('text')).toBe('Niet-bewaarde tekst gevonden');
		expect(banner.getAttribute('supporting-text')).toBe(
			'De pagina is intussen gewijzigd; deze tekst is gebaseerd op een oudere versie'
		);
		expect([...banner.querySelectorAll('nldd-button')].map((b) => b.getAttribute('text'))).toEqual([
			'Herstel',
			'Gooi weg'
		]);
	});
});

describe('the banner for a page that cannot be edited', () => {
	it.each(['toml', 'yaml-error', 'unterminated', 'iets anders'])(
		'speaks of the eigenschappen of the page for %s',
		(reason) => {
			const banner = screen(LeesAlleenBanner, {
				readOnly: { reason, message: 'detail', githubUrl: 'https://github.com/o/r/blob/main/a.md' }
			}).querySelector('nldd-banner')!;
			const text = banner.getAttribute('supporting-text')!;
			expect(text).toMatch(/^De eigenschappen van deze pagina /);
			expect(text).not.toMatch(/frontmatter/i);
		}
	);
});

describe('the changes of a page', () => {
	it('lists the changed properties as eigenschappen', () => {
		const document = screen(Diff, {
			path: 'docs/index.md',
			titel: 'Index',
			before: '---\ntitle: Oud\n---\nTekst\n',
			after: '---\ntitle: Nieuw\n---\nTekst\n',
			source: []
		});
		expect(document.querySelector('table.gegevens caption')?.textContent).toBe(
			'Gewijzigde eigenschappen'
		);
		expect(
			[...document.querySelectorAll('table.gegevens th[scope="col"]')].map((th) => th.textContent)
		).toEqual(['Eigenschap', 'Huidig', 'Voorgesteld']);
	});
});

describe('the links that leave Schrijver', () => {
	const GITHUB = 'https://github.com/DigiGilde/handboek/blob/main/docs/a.md';

	it('say what they open: the file of a page that cannot be edited', () => {
		const button = screen(LeesAlleenBanner, {
			readOnly: { reason: 'toml', message: 'detail', githubUrl: GITHUB }
		}).querySelector('nldd-banner nldd-button[slot="actions"]')!;
		expect(button.getAttribute('text')).toBe('Bestand bekijken op GitHub');
		expect(button.getAttribute('href')).toBe(GITHUB);
		expect(button.getAttribute('target')).toBe('_blank');
	});

	it('say what they open: a change that is too large to show', () => {
		const document = screen(Diff, {
			path: 'docs/a.md',
			titel: 'A',
			before: null,
			after: null,
			source: [],
			status: 'modified',
			teGroot: true,
			githubUrl: 'https://github.com/DigiGilde/handboek/pull/3/files'
		});
		expect(document.querySelector('nldd-link')?.getAttribute('text')).toBe(
			'Wijziging bekijken op GitHub'
		);
	});

	it('say what they open: the folder of the structure on GitHub', () => {
		const document = screen(Structuur, {
			structuur: {
				bruikbaar: true,
				fouten: [],
				url: 'https://github.com/DigiGilde/handboek/tree/main/.schrijver',
				samenvatting: null
			}
		});
		expect(document.querySelector('nldd-link')?.getAttribute('text')).toBe(
			'.schrijver bekijken op GitHub'
		);
	});

	it('say where they lead: on to GitHub, where the account is linked', () => {
		const document = screen(GitHubStart, { data: { url: 'https://github.com/login/oauth' } });
		expect(document.querySelector('a[href="https://github.com/login/oauth"]')?.textContent).toBe(
			'Verder naar GitHub'
		);
	});

	it('name the repository on Over, not its branch', () => {
		const document = screen(Over, {
			data: {
				site: { id: 'digi-handboek', naam: 'Digi Handboek', omschrijving: null, adres: null },
				redactie: [],
				kanBeheren: false,
				mergenVanuitSchrijver: true,
				ondertekenen: ['anoniem'],
				zichtbaarheid: 'iedereen',
				repoOpenbaar: true,
				conceptenOpenbaar: true,
				voorbeeld: 'bij-push',
				repo: 'DigiGilde/handboek',
				repoUrl: 'https://github.com/DigiGilde/handboek/tree/main',
				structuurUrl: 'https://github.com/DigiGilde/handboek/tree/main/.schrijver'
			}
		});
		const link = document.querySelector(
			'a[href="https://github.com/DigiGilde/handboek/tree/main"]'
		);
		expect(link?.textContent).toBe('DigiGilde/handboek');
		expect(document.body.textContent).not.toMatch(/branch/i);
	});
});

describe('the settings of a colleague', () => {
	const props = { identity: 'anoniem', emailVerified: true, sites: [], headings: true };
	const buttons = (document: Document) =>
		[...document.querySelectorAll('nldd-button')].map((button) => button.getAttribute('text'));

	it('are saved with "Bewaar", and the GitHub account is linked with "GitHub-account koppelen"', () => {
		expect(buttons(screen(PrefsForm, { ...props, githubLogin: '' }))).toEqual([
			'Bewaar',
			'GitHub-account koppelen'
		]);
	});

	it('unlink the GitHub account with "Ontkoppel GitHub-account"', () => {
		expect(buttons(screen(PrefsForm, { ...props, githubLogin: 'torvalds' }))).toEqual([
			'Bewaar',
			'Ontkoppel GitHub-account'
		]);
	});
});
