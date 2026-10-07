<script lang="ts">
	import { markdownToHtml } from '$lib/content/markdown-preview';
	import { parsePage } from '$lib/content/frontmatter';
	import type { SourcePart } from '$lib/content/source-diff';

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

	let oldHtml = $state('');
	let newHtml = $state('');
	$effect(() => {
		oldHtml = markdownToHtml(old.body);
		newHtml = markdownToHtml(nieuw.body);
	});
</script>

<section class="diff" aria-label={path}>
	<nldd-title size="4" heading-level="3" text={path}>
		{#if before === null}<nldd-badge slot="end" color="accent" text="Nieuwe pagina"
			></nldd-badge>{/if}
		{#if after === null}<nldd-badge slot="end" color="critical" text="Verwijderd"></nldd-badge>{/if}
	</nldd-title>

	{#if changes.length > 0}
		<table>
			<caption>Gewijzigde gegevens bovenaan de pagina</caption>
			<thead>
				<tr><th scope="col">Veld</th><th scope="col">Huidig</th><th scope="col">Voorgesteld</th></tr
				>
			</thead>
			<tbody>
				{#each changes as c (c.key)}
					<tr><th scope="row">{c.key}</th><td>{c.before}</td><td>{c.after}</td></tr>
				{/each}
			</tbody>
		</table>
	{/if}

	<div class="kolommen">
		<section aria-label="Huidige versie van {path}">
			<nldd-title size="5" heading-level="4" text="Huidige versie"></nldd-title>
			{#if oldHtml}<nldd-rich-text>{@html oldHtml}</nldd-rich-text>{:else}<pre>{old.body}</pre>{/if}
		</section>
		<section aria-label="Voorgestelde versie van {path}">
			<nldd-title size="5" heading-level="4" text="Voorgestelde versie"></nldd-title>
			{#if newHtml}<nldd-rich-text>{@html newHtml}</nldd-rich-text
				>{:else}<pre>{nieuw.body}</pre>{/if}
		</section>
	</div>

	<details>
		<summary>Brontekst vergelijken</summary>
		<pre class="bron">{#each source as part, i (i)}{#if part.kind === 'added'}<ins
						><span class="sr-only">toegevoegd: </span>{part.text}</ins
					>{:else if part.kind === 'removed'}<del
						><span class="sr-only">verwijderd: </span>{part.text}</del
					>{:else if part.kind === 'skip'}<span class="overgeslagen"
						>... {part.lines} {part.lines === 1 ? 'regel' : 'regels'} ongewijzigd ...
</span>{:else}{part.text}{/if}{/each}</pre>
	</details>
</section>

<style>
	.kolommen {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr));
		gap: 24px;
	}
	pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		margin: 0;
	}
	details {
		margin-block-start: 12px;
	}
	.bron {
		font-family: monospace;
		padding: 8px;
		border: 1px solid currentColor;
		border-radius: 4px;
	}
	ins {
		text-decoration: underline;
	}
	del {
		text-decoration: line-through;
	}
	.overgeslagen {
		font-style: italic;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	table {
		border-collapse: collapse;
		margin-block: 12px;
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
