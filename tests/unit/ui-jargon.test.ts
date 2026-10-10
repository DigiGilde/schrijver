import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { visibleStrings } from './svelte-text';

/*
 * The words of the interface are Dutch and plain: a colleague reads "voorstel", "bewaren" and
 * "samenvoegen", never what GitHub calls them. Everything a .svelte file can show is read from its
 * syntax tree (see svelte-text.ts) and held against the words below.
 */

const FOLDERS = ['src/routes', 'src/lib/components'];

/** The screens only platform admins read: they may say "standaardbranch". */
const PLATFORM_ADMIN_SCREENS = [
	'src/routes/instellingen/sites/nieuw/+page.svelte',
	'src/routes/instellingen/sites/[site]/Structuur.svelte'
];

const JARGON: { word: string; pattern: RegExp }[] = [
	{ word: 'pull request', pattern: /\bpull[- ]requests?\b/i },
	{ word: 'branch', pattern: /\b(standaard)?branch(es)?\b/i },
	{ word: 'merge', pattern: /\bmerg(e|ed|es|ing)\b/i },
	{ word: 'frontmatter', pattern: /frontmatter/i },
	{ word: 'opslaan', pattern: /\b(opslaan|opgeslagen|op te slaan)\b/i },
	{ word: 'Concept bewaren', pattern: /\bconcept bewaren\b/i },
	{ word: 'gegevensblok', pattern: /gegevensblok|gegevens bovenaan/i },
	{ word: 'beginpagina', pattern: /\bbeginpagina\b/i },
	{ word: 'afmelden', pattern: /\b(afmelden|afgemeld|meld je af)\b/i },
	{ word: 'alternatieve tekst', pattern: /\balternatieve tekst\b/i }
];

/** The jargon in a source, as "text" says word: what a reviewer needs to find it. */
function jargonIn(source: string, file = ''): string[] {
	const allowed = PLATFORM_ADMIN_SCREENS.includes(file);
	return visibleStrings(source).flatMap((text) =>
		JARGON.filter(({ pattern }) =>
			pattern.test(allowed ? text.replaceAll('standaardbranch', '') : text)
		).map(({ word }) => `${JSON.stringify(text.trim().slice(0, 70))} says ${word}`)
	);
}

function svelteFiles(folder: string): string[] {
	return readdirSync(folder).flatMap((name) => {
		const path = `${folder}/${name}`;
		if (statSync(path).isDirectory()) return svelteFiles(path);
		return path.endsWith('.svelte') ? [path] : [];
	});
}

const files = FOLDERS.flatMap(svelteFiles);

describe('the visible text of the app', () => {
	it('is read from every screen and component', () => {
		expect(files.length).toBeGreaterThan(30);
		expect(files).toEqual(
			expect.arrayContaining([
				'src/lib/components/Opslaan.svelte',
				'src/routes/help/+page.svelte',
				'src/routes/instellingen/sites/nieuw/+page.svelte'
			])
		);
	});

	it('keeps pull request, branch, merge, frontmatter, opslaan and Concept bewaren out', () => {
		const found = files.flatMap((file) =>
			jargonIn(readFileSync(file, 'utf8'), file).map((line) => `${file}: ${line}`)
		);
		expect(found).toEqual([]);
	});
});

describe('the jargon check', () => {
	it.each([
		['text in the template', '<p>Je pull request staat klaar</p>', 'pull request'],
		['an attribute', '<nldd-button text="Opslaan"></nldd-button>', 'opslaan'],
		[
			'an attribute with a sentence',
			'<nldd-banner text="Ongeldige branch"></nldd-banner>',
			'branch'
		],
		['an expression', "<p>{ja ? 'Start de merge' : 'Nee'}</p>", 'merge'],
		['a template string', '<p>{`De frontmatter van ${naam}`}</p>', 'frontmatter'],
		['a script string', "<script>const KLAAR = 'Concept bewaren';</script>", 'Concept bewaren'],
		[
			'a typed script',
			'<script lang="ts">const klaar: string = \'Pull request ontbreekt\' as const;</script>',
			'pull request'
		],
		['an old word of the vocabulary', '<p>De gegevens bovenaan de pagina</p>', 'gegevensblok'],
		[
			'a standaardbranch off the platform-admin screens',
			'<p>De standaardbranch is main</p>',
			'branch'
		]
	])('finds it in %s', (_where, source, word) => {
		const found = jargonIn(source, 'src/routes/help/+page.svelte');
		expect(found).toHaveLength(1);
		expect(found[0]).toMatch(new RegExp(`says ${word}$`));
	});

	it('leaves the standaardbranch to the screens of platform admins', () => {
		const source = '<p>Schrijver werkt op de standaardbranch main.</p>';
		for (const file of PLATFORM_ADMIN_SCREENS) expect(jargonIn(source, file)).toEqual([]);
		expect(
			jargonIn('<p>Schrijver werkt op de branch main.</p>', PLATFORM_ADMIN_SCREENS[0])
		).toHaveLength(1);
	});

	it('does not take names in the code for words on the screen', () => {
		const source = `<script lang="ts">
	import Opslaan from '$lib/components/Opslaan.svelte';
	let opslaan: ReturnType<typeof Opslaan> | undefined = $state();
	const BRANCH = 'new';
	const data = new FormData();
	data.set('branch', 'schrijver/x');
	type Kind = 'opslaan' | 'merge';
</script>
<Opslaan bind:this={opslaan} branch={BRANCH} />
<form action="?/opslaan" data-kind="merge"></form>
<!-- the pull request, in a comment -->
<style>.opslaan { color: red; }</style>`;
		expect(jargonIn(source, 'src/routes/help/+page.svelte')).toEqual([]);
	});
});
