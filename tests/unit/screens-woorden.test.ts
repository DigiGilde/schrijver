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
