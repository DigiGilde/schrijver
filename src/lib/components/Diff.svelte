<script lang="ts">
	import DOMPurify from 'dompurify';
	import { PURIFY_CONFIG, markdownToHtml } from '$lib/content/markdown-preview';
	import { parsePage } from '$lib/content/frontmatter';
	import { countChanges, renderedDiff, toHtml, withContext } from '$lib/content/rendered-diff';
	import type { SourcePart, Word } from '$lib/content/source-diff';

	let {
		path,
		before,
		after,
		source
	}: { path: string; before: string | null; after: string | null; source: SourcePart[] } = $props();

	type Split = { frontmatter: Record<string, unknown>; body: string };
	const split = (text: string | null): Split => {
		if (text === null) return { frontmatter: {}, body: '' };
		const page = parsePage(text);
		return page.ok
			? { frontmatter: page.frontmatter, body: page.body }
			: { frontmatter: {}, body: text };
	};
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
	let aantal = $state(0);
	let klaar = $state(false);

	$effect(() => {
		if (before === null || after === null) {
			plainHtml = markdownToHtml(before === null ? nieuw.body : old.body);
		} else {
			const blocks = renderedDiff(old.body, nieuw.body, (md) => markdownToHtml(md), document);
			const clean = (html: string) => DOMPurify.sanitize(html, PURIFY_CONFIG);
			aantal = countChanges(blocks);
			diffHtml = {
				wijzigingen: clean(toHtml(withContext(blocks), document)),
				pagina: clean(toHtml(blocks, document))
			};
		}
		klaar = true;
	});

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

<section class="diff" aria-label={path}>
	<nldd-title size="4" heading-level="3" text={path}>
		{#if before === null}<nldd-badge slot="end" color="accent" text="Nieuwe pagina"
			></nldd-badge>{/if}
		{#if after === null}<nldd-badge slot="end" color="critical" text="Verwijderd"></nldd-badge>{/if}
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

	{#if before === null || after === null}
		{#if plainHtml}
			<nldd-rich-text class="inhoud">{@html plainHtml}</nldd-rich-text>
		{:else}
			<pre>{before === null ? nieuw.body : old.body}</pre>
		{/if}
	{:else}
		<nldd-segmented-control
			class="weergave"
			size="sm"
			accessible-label="Weergave van de wijzigingen in {path}"
			value={view}
			onchange={onWeergave}
		>
			<nldd-segmented-control-item value="wijzigingen" text="Wijzigingen"
			></nldd-segmented-control-item>
			<nldd-segmented-control-item value="pagina" text="Hele pagina"></nldd-segmented-control-item>
			<nldd-segmented-control-item value="bron" text="Brontekst"></nldd-segmented-control-item>
		</nldd-segmented-control>

		{#if klaar}
			<nldd-text size="sm" color="secondary">
				{#if aantal === 0}
					Geen wijzigingen in de tekst.
				{:else}
					{aantal}
					{aantal === 1 ? 'wijziging' : 'wijzigingen'}.
					{#if view === 'bron'}
						Toegevoegde regels zijn groen met een plus, verwijderde regels rood met een min.
					{:else}
						Toegevoegd is groen en onderstreept, verwijderd is rood en doorgestreept.
					{/if}
				{/if}
			</nldd-text>
		{/if}

		{#if view === 'bron'}
			<pre class="bron">{#each source as part, i (i)}{#if part.kind === 'skip'}<span
							class="overgeslagen"
							>... {part.lines} {part.lines === 1 ? 'regel' : 'regels'} ongewijzigd ...</span
						>{:else if part.kind === 'added'}<ins
							><span class="sr-only">toegevoegd: </span>{@render rows(part)}</ins
						>{:else if part.kind === 'removed'}<del
							><span class="sr-only">verwijderd: </span>{@render rows(part)}</del
						>{:else}{@render rows(part)}{/if}{/each}</pre>
		{:else if klaar}
			<nldd-rich-text class="inhoud"
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
		background: none;
		color: inherit;
		border-radius: 2px;
	}
	.added .woord {
		outline: 1px solid var(--semantics-categories-success-tinted-highlight-border-color);
	}
	.removed .woord {
		outline: 1px solid var(--semantics-categories-critical-tinted-highlight-border-color);
	}

	.inhoud :global([data-diff='toegevoegd']),
	.inhoud :global([data-diff='wordt']) {
		background-color: var(--semantics-categories-success-tinted-background-color);
		box-shadow: inset 4px 0 0 var(--semantics-categories-success-tinted-highlight-border-color);
	}
	.inhoud :global([data-diff='verwijderd']),
	.inhoud :global([data-diff='was']) {
		background-color: var(--semantics-categories-critical-tinted-background-color);
		box-shadow: inset 4px 0 0 var(--semantics-categories-critical-tinted-highlight-border-color);
	}
	.inhoud :global([data-diff='verwijderd']) {
		text-decoration: line-through;
	}
	.inhoud :global([data-diff]:not(ul, ol, blockquote)) {
		padding-inline: 12px;
	}
	/* A heading's text is taller than its line box; without this the tint does not cover all of it. */
	.inhoud :global(:is(h1, h2, h3, h4, h5, h6)[data-diff]) {
		padding-block: 0.1em;
	}
	.inhoud :global([data-diff='wordt'] ins),
	.gegevens ins {
		background-color: var(--semantics-categories-success-tinted-background-color);
		text-decoration: underline 2px;
	}
	.inhoud :global([data-diff='was'] del),
	.gegevens del {
		background-color: var(--semantics-categories-critical-tinted-background-color);
		text-decoration: line-through 2px;
	}
	.inhoud :global(.diff-overgeslagen) {
		color: var(--semantics-content-secondary-color);
		font-style: italic;
	}
	/* Forced colours drop the tint and the shadow; a bar of its own keeps added and removed blocks apart. */
	@media (forced-colors: active) {
		.inhoud :global([data-diff='toegevoegd']),
		.inhoud :global([data-diff='wordt']) {
			border-inline-start: 4px solid;
		}
		.inhoud :global([data-diff='verwijderd']),
		.inhoud :global([data-diff='was']) {
			border-inline-start: 4px dashed;
		}
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
