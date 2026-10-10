<script lang="ts">
	import DOMPurify from 'dompurify';
	import { PURIFY_CONFIG, markdownToHtml, type ResolveImage } from '$lib/content/markdown-preview';
	import {
		TE_GROOT,
		comparePages,
		splitPage,
		toHtml,
		withContext
	} from '$lib/content/rendered-diff';
	import type { SourcePart, Word } from '$lib/content/source-diff';

	let {
		path,
		before,
		after,
		source,
		status = 'modified',
		teGroot: paginaTeGroot = false,
		titel,
		githubUrl,
		images
	}: {
		path: string;
		before: string | null;
		after: string | null;
		source: SourcePart[];
		status?: 'added' | 'removed' | 'modified';
		/** The server did not fetch the page: it is above the size a proposal view compares. */
		teGroot?: boolean;
		/** The page title: the heading, with the path under it. */
		titel: string;
		/** Where GitHub shows a change too large to show here. */
		githubUrl?: string;
		/** Where the images of the old and of the new text are, when they sit at other versions. */
		images?: { before: ResolveImage; after: ResolveImage };
	} = $props();
	const nieuwePagina = $derived(paginaTeGroot ? status === 'added' : before === null);
	const verwijderd = $derived(paginaTeGroot ? status === 'removed' : after === null);

	const split = (text: string | null) =>
		text === null ? { frontmatter: {}, body: '' } : splitPage(text);
	const show = (v: unknown) =>
		v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);

	const old = $derived(split(before));
	const nieuw = $derived(split(after));
	const changes = $derived(
		[...new Set([...Object.keys(old.frontmatter), ...Object.keys(nieuw.frontmatter)])]
			.filter((k) => show(old.frontmatter[k]) !== show(nieuw.frontmatter[k]))
			.map((k) => ({ key: k, before: show(old.frontmatter[k]), after: show(nieuw.frontmatter[k]) }))
	);

	type View = 'wijzigingen' | 'pagina' | 'bron';
	const VIEWS: View[] = ['wijzigingen', 'pagina', 'bron'];
	let view = $state<View>('wijzigingen');

	function onWeergave(event: Event) {
		const value = (event as CustomEvent<{ value?: string }>).detail?.value;
		view = VIEWS.find((v) => v === value) ?? 'wijzigingen';
	}

	let plainHtml = $state('');
	let diffHtml = $state({ wijzigingen: '', pagina: '' });
	let aantal = $state<number | null>(0);
	let klaar = $state(false);

	$effect(() => {
		if (paginaTeGroot) {
			klaar = true;
			return;
		}
		const render = (md: string, side: 'before' | 'after') =>
			markdownToHtml(md, undefined, images?.[side]);
		if (before === null || after === null) {
			plainHtml = before === null ? render(nieuw.body, 'after') : render(old.body, 'before');
		} else {
			const { blocks, count } = comparePages(before, after, render, document);
			const clean = (html: string) => DOMPurify.sanitize(html, PURIFY_CONFIG);
			aantal = count;
			diffHtml = {
				wijzigingen: clean(toHtml(withContext(blocks), document)),
				pagina: clean(toHtml(blocks, document))
			};
		}
		klaar = true;
	});

	const vergeleken = $derived(!paginaTeGroot && before !== null && after !== null);
	const bronTeGroot = $derived(source.some((part) => part.kind === 'te-groot'));
	const teGroot = $derived(view === 'bron' ? bronTeGroot : aantal === null);
	const telling = $derived(
		!vergeleken || !klaar || aantal === null
			? null
			: aantal === 0
				? 'geen wijzigingen in de tekst'
				: `${aantal} ${aantal === 1 ? 'wijziging' : 'wijzigingen'}`
	);
	const onderkop = $derived([path, telling].filter(Boolean).join(' · '));

	type Lines = Extract<SourcePart, { text: string }>;
	const GUTTER = { added: '+', removed: '-', same: '' };

	function linesOf(part: Lines): Word[][] {
		const rows: Word[][] = [[]];
		for (const word of part.words ?? [{ text: part.text, changed: false }]) {
			word.text.split('\n').forEach((piece, i) => {
				if (i > 0) rows.push([]);
				if (piece) rows[rows.length - 1].push({ text: piece, changed: word.changed });
			});
		}
		if (rows[rows.length - 1].length === 0) rows.pop();
		return rows;
	}
</script>

{#snippet rows(part: Lines)}
	{#each linesOf(part) as words, n (n)}
		<span class="regel {part.kind}"
			><span class="goot" aria-hidden="true">{GUTTER[part.kind]}</span
			>{#each words as word, k (k)}{#if word.changed}<mark class="woord">{word.text}</mark
					>{:else}{word.text}{/if}{/each}</span
		>
	{/each}
{/snippet}

{#snippet teGrootMelding()}
	{#if githubUrl}
		<nldd-text>
			Deze wijziging is te groot om hier te tonen.
			<nldd-link href={githubUrl} target="_blank" text="Bekijk haar op GitHub"></nldd-link>
		</nldd-text>
	{:else}
		<nldd-text>{TE_GROOT}</nldd-text>
	{/if}
{/snippet}

<section class="diff" aria-label={titel}>
	<nldd-title size="4" heading-level="3" text={titel} supporting-text={onderkop}>
		{#if nieuwePagina}<nldd-badge slot="end" color="accent" text="Nieuwe pagina"></nldd-badge>{/if}
		{#if verwijderd}<nldd-badge slot="end" color="critical" text="Verwijderd"></nldd-badge>{/if}
	</nldd-title>

	{#if changes.length > 0}
		<table class="gegevens">
			<caption>Gewijzigde gegevens bovenaan de pagina</caption>
			<thead>
				<tr><th scope="col">Veld</th><th scope="col">Huidig</th><th scope="col">Voorgesteld</th></tr
				>
			</thead>
			<tbody>
				{#each changes as c (c.key)}
					<tr
						><th scope="row">{c.key}</th><td
							>{#if c.before}<del>{c.before}</del>{/if}</td
						><td
							>{#if c.after}<ins>{c.after}</ins>{/if}</td
						></tr
					>
				{/each}
			</tbody>
		</table>
	{/if}

	{#if paginaTeGroot}
		{@render teGrootMelding()}
	{:else if before === null || after === null}
		{#if plainHtml}
			<nldd-rich-text class="inhoud">{@html plainHtml}</nldd-rich-text>
		{:else}
			<pre>{before === null ? nieuw.body : old.body}</pre>
		{/if}
	{:else}
		<nldd-segmented-control
			class="weergave"
			size="sm"
			accessible-label="Weergave van de wijzigingen in {titel}"
			value={view}
			onchange={onWeergave}
		>
			<nldd-segmented-control-item value="wijzigingen" text="Wijzigingen"
			></nldd-segmented-control-item>
			<nldd-segmented-control-item value="pagina" text="Hele pagina"></nldd-segmented-control-item>
			<nldd-segmented-control-item value="bron" text="Markdown"></nldd-segmented-control-item>
		</nldd-segmented-control>

		{#if view === 'bron'}
			<nldd-text size="sm" color="secondary">
				De tekst met de opmaakcodes, zoals hij in het bestand staat.
			</nldd-text>
		{/if}

		{#if klaar && teGroot}
			{@render teGrootMelding()}
		{:else if view === 'bron'}
			<pre class="bron">{#each source as part, i (i)}{#if part.kind === 'skip'}<span
							class="overgeslagen"
							>... {part.lines} {part.lines === 1 ? 'regel' : 'regels'} ongewijzigd ...</span
						>{:else if part.kind === 'te-groot'}<span class="overgeslagen">{TE_GROOT}</span
						>{:else if part.kind === 'added'}<ins
							><span class="sr-only">toegevoegd: </span>{@render rows(part)}</ins
						>{:else if part.kind === 'removed'}<del
							><span class="sr-only">verwijderd: </span>{@render rows(part)}</del
						>{:else}{@render rows(part)}{/if}{/each}</pre>
		{:else if klaar}
			<nldd-rich-text class="inhoud" class:context={view === 'wijzigingen'}
				>{@html view === 'pagina' ? diffHtml.pagina : diffHtml.wijzigingen}</nldd-rich-text
			>
		{/if}
	{/if}
</section>

<style>
	.diff {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 12px;
	}
	.weergave {
		justify-self: start;
	}
	pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		margin: 0;
	}
	.bron {
		font-family: monospace;
		white-space: normal;
		padding: 8px;
		border: 1px solid currentColor;
		border-radius: 4px;
	}
	.bron ins,
	.bron del,
	.overgeslagen {
		display: block;
		text-decoration: none;
	}
	.overgeslagen {
		font-style: italic;
	}
	.regel {
		display: block;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		min-block-size: 1lh;
		padding-inline-start: 2ch;
		text-indent: -2ch;
	}
	.goot {
		display: inline-block;
		inline-size: 2ch;
		text-indent: 0;
	}
	.added {
		background-color: var(--semantics-categories-success-tinted-background-color);
	}
	.added .goot {
		color: var(--semantics-categories-success-tinted-content-color);
	}
	.removed {
		background-color: var(--semantics-categories-critical-tinted-background-color);
	}
	.removed .goot {
		color: var(--semantics-categories-critical-tinted-content-color);
	}
	.woord {
		border-radius: 2px;
	}
	.added .woord {
		background-color: var(--semantics-categories-success-filled-background-color);
		color: var(--semantics-categories-success-filled-content-color);
	}
	.removed .woord {
		background-color: var(--semantics-categories-critical-filled-background-color);
		color: var(--semantics-categories-critical-filled-content-color);
	}

	/*
	 * The bar is the border of a pseudo-element. A shadow cannot be dashed, a border on the block itself would
	 * replace the border of quotes and tables, and axe cannot measure text over a background image.
	 */
	.inhoud :global([data-diff]) {
		position: relative;
	}
	.inhoud :global([data-diff])::before {
		content: '';
		position: absolute;
		inset-block: 0;
		inset-inline-start: 0;
		border-inline-start: 4px solid var(--bar);
	}
	.inhoud :global([data-diff='toegevoegd']),
	.inhoud :global([data-diff='wordt']) {
		--bar: var(--semantics-categories-success-filled-background-color);
		background-color: var(--semantics-categories-success-tinted-background-color);
	}
	.inhoud :global([data-diff='verwijderd']),
	.inhoud :global([data-diff='was']) {
		--bar: var(--semantics-categories-critical-filled-background-color);
		background-color: var(--semantics-categories-critical-tinted-background-color);
	}
	.inhoud :global([data-diff='verwijderd'])::before,
	.inhoud :global([data-diff='was'])::before {
		border-inline-start-style: dashed;
	}
	.inhoud :global([data-diff='verwijderd']) {
		text-decoration: line-through;
	}
	.inhoud :global([data-diff]:not(ul, ol, blockquote)) {
		padding-inline: 12px;
	}
	/* A thematic break has no height of its own, so its tint and bar would not show. */
	.inhoud :global(hr[data-diff]) {
		padding-block: 0.75rem;
	}
	/* A heading's text is taller than its line box; without this the tint does not cover all of it. */
	.inhoud :global(:is(h1, h2, h3, h4, h5, h6)[data-diff]) {
		padding-block: 0.1em;
	}
	.inhoud :global([data-diff='wordt'] ins),
	.gegevens ins {
		background-color: var(--semantics-categories-success-filled-background-color);
		color: var(--semantics-categories-success-filled-content-color);
		text-decoration: underline 2px;
		border-radius: 2px;
	}
	.inhoud :global([data-diff='was'] del),
	.gegevens del {
		background-color: var(--semantics-categories-critical-filled-background-color);
		color: var(--semantics-categories-critical-filled-content-color);
		text-decoration: line-through 2px;
		border-radius: 2px;
	}
	.inhoud :global(:is(ins, del) a) {
		color: inherit;
	}
	.inhoud :global(.diff-overgeslagen) {
		color: var(--semantics-content-secondary-color);
		font-style: italic;
	}
	/* Inline-block, so the strike-through of a removed block does not run through its word. */
	.inhoud :global(.diff-woord) {
		display: inline-block;
		margin-inline-end: 0.5em;
		padding-inline: 0.4em;
		border-radius: 2px;
		font-size: 0.875em;
		font-style: normal;
		font-weight: 600;
		line-height: 1.4;
		text-decoration: none;
	}
	.inhoud :global(.diff-woord:is([data-woord='toegevoegd'], [data-woord='wordt'])) {
		background-color: var(--semantics-categories-success-filled-background-color);
		color: var(--semantics-categories-success-filled-content-color);
	}
	.inhoud :global(.diff-woord:is([data-woord='verwijderd'], [data-woord='was'])) {
		background-color: var(--semantics-categories-critical-filled-background-color);
		color: var(--semantics-categories-critical-filled-content-color);
	}
	.context > :global(:not([data-diff], .diff-woord, .sr-only, .diff-overgeslagen)) {
		color: var(--semantics-content-secondary-color);
	}

	.sr-only,
	.inhoud :global(.sr-only) {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	table {
		border-collapse: collapse;
	}
	caption {
		text-align: start;
		font-weight: bold;
	}
	th,
	td {
		text-align: start;
		padding: 4px 12px 4px 0;
		overflow-wrap: anywhere;
	}
</style>
