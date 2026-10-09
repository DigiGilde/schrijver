import { JSDOM } from 'jsdom';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import AppBalk from '../../src/lib/components/AppBalk.svelte';

function bar() {
	const { body } = render(AppBalk, {
		props: { userName: 'Test Gebruiker', email: 'test@example.org', testEnvironment: false }
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
