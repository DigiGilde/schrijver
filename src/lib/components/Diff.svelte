<script lang="ts">
	import { markdownToHtml } from '$lib/content/markdown-preview';
	import { parsePage } from '$lib/content/frontmatter';

	let { path, before, after }: { path: string; before: string | null; after: string | null } = $props();

	type Split = { frontmatter: Record<string, unknown>; body: string };
	const split = (text: string | null): Split => {
		if (text === null) return { frontmatter: {}, body: '' };
		const page = parsePage(text);
		return page.ok ? { frontmatter: page.frontmatter, body: page.body } : { frontmatter: {}, body: text };
	};
	const show = (v: unknown) => (v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v));

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
		{#if before === null}<nldd-badge slot="end" color="accent" text="Nieuwe pagina"></nldd-badge>{/if}
		{#if after === null}<nldd-badge slot="end" color="critical" text="Verwijderd"></nldd-badge>{/if}
	</nldd-title>

	{#if changes.length > 0}
		<table>
			<caption>Gewijzigde gegevens bovenaan de pagina</caption>
			<thead>
				<tr><th scope="col">Veld</th><th scope="col">Huidig</th><th scope="col">Voorgesteld</th></tr>
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
			{#if newHtml}<nldd-rich-text>{@html newHtml}</nldd-rich-text>{:else}<pre>{nieuw.body}</pre>{/if}
		</section>
	</div>
</section>

<style>
	.kolommen {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: 24px;
	}
	pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		margin: 0;
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
