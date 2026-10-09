import { JSDOM } from 'jsdom';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import AppBalk from '../../src/lib/components/AppBalk.svelte';

function bar(site?: { id: string; naam: string } | null) {
	const { body } = render(AppBalk, {
		props: { userName: 'Test Gebruiker', email: 'test@example.org', testEnvironment: false, site }
	});
	return new JSDOM(body).window.document;
}

describe('the wordmark', () => {
	it('is the file-text-pencil icon in the accent block, followed by the whole word', () => {
		const wordmark = bar().querySelector('nldd-toolbar-title [slot="media"]')!;
		expect(wordmark.querySelector('.blok nldd-icon')?.getAttribute('icon')).toBe(
			'file-text-pencil'
		);
		expect(wordmark.querySelector('.blok')?.textContent?.trim()).toBe('');
		expect(wordmark.querySelector('.woord')?.textContent).toBe('Schrijver');
	});

	it('is one image named Schrijver and leads home', () => {
		const title = bar().querySelector('nldd-toolbar-title')!;
		expect(title.getAttribute('href')).toBe('/');
		const wordmark = title.querySelector('[slot="media"]')!;
		expect(wordmark.getAttribute('role')).toBe('img');
		expect(wordmark.getAttribute('aria-label')).toBe('Schrijver');
	});

	it('leaves the name to the image, so a screen reader does not read it twice', () => {
		const title = bar().querySelector('nldd-toolbar-title')!;
		expect(title.hasAttribute('text')).toBe(false);
		for (const part of title.querySelectorAll('.blok, .woord')) {
			expect(part.getAttribute('aria-hidden')).toBe('true');
		}
	});
});

/** The destinations of the menu and of the twins that the toolbar clones into its overflow menu. */
function destinations(document: Document) {
	const read = (items: Iterable<Element>) =>
		[...items].map((item) => ({
			text: item.getAttribute('text'),
			icon: item.getAttribute('icon'),
			href: item.getAttribute('href')
		}));
	return {
		menu: read(document.querySelectorAll('nldd-menu > nldd-menu-item')),
		overflow: read(document.querySelectorAll('nldd-toolbar-item > nldd-menu-item[slot="overflow"]'))
	};
}

const SITES = { text: 'Sites', icon: 'globe', href: '/' };
const HELP = { text: 'Help', icon: 'help', href: '/help' };
const OVER = { text: 'Over Digi Handboek', icon: 'info', href: '/sites/digi-handboek/over' };

describe('the menu', () => {
	it('has Sites and Help where the page belongs to no site', () => {
		for (const site of [undefined, null]) {
			expect(destinations(bar(site))).toEqual({ menu: [SITES, HELP], overflow: [SITES, HELP] });
		}
	});

	it('also has Over <site>, between Sites and Help, where the page belongs to a site', () => {
		const site = { id: 'digi-handboek', naam: 'Digi Handboek' };
		expect(destinations(bar(site))).toEqual({
			menu: [SITES, OVER, HELP],
			overflow: [SITES, OVER, HELP]
		});
	});

	it('names the site in the item and leads to the Over page of that site', () => {
		const { menu } = destinations(bar({ id: 'moza-site', naam: 'MijnOverheid Zakelijk' }));
		expect(menu[1]).toEqual({
			text: 'Over MijnOverheid Zakelijk',
			icon: 'info',
			href: '/sites/moza-site/over'
		});
	});

	it('keeps the account group after the destinations', () => {
		const document = bar({ id: 'digi-handboek', naam: 'Digi Handboek' });
		const group = document.querySelector('nldd-menu > nldd-menu-group')!;
		expect(
			[...group.querySelectorAll('nldd-menu-item')].map((i) => i.getAttribute('text'))
		).toEqual(['Instellingen', 'Uitloggen']);
	});
});
