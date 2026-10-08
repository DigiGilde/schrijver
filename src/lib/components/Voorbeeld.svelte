<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import {
		colourScheme,
		loadMermaid,
		siteTokens,
		watchColourScheme
	} from '$lib/client/mermaid-preview';
	import { markdownToHtml, type ResolveImage } from '$lib/content/markdown-preview';
	import {
		diagramBackground,
		mermaidConfig,
		resolveTokens,
		type ColourScheme,
		type DiagramTokens
	} from '$lib/content/mermaid-look';

	type Props = { value: string; resolveImage?: ResolveImage };
	let { value, resolveImage }: Props = $props();

	const DEBOUNCE_MS = 300;

	let html = $state('');
	let container: HTMLElement | undefined = $state();
	let first = true;
	let scheme = $state<ColourScheme>('light');
	/** Tokens the site does not know, drawn in a neutral colour. */
	let vervangen = $state<string[]>([]);
	let ronde = 0;
	let teller = 0;

	onMount(() => {
		scheme = colourScheme();
		return watchColourScheme((next) => (scheme = next));
	});

	$effect(() => {
		const current = value;
		const resolve = resolveImage;
		const delay = first ? 0 : DEBOUNCE_MS;
		first = false;
		const timer = setTimeout(() => {
			html = markdownToHtml(current, undefined, resolve);
		}, delay);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		void html;
		if (container) inNieuwTabblad(container);
	});

	$effect(() => {
		void html;
		void renderDiagrams(scheme);
	});

	/* Following a link in the preview must never replace the page being edited; a jump within it may. */
	function inNieuwTabblad(root: HTMLElement) {
		for (const link of root.querySelectorAll<HTMLAnchorElement>(
			'a[href]:not([href^="#"]):not([target])'
		)) {
			link.target = '_blank';
			link.rel = 'noopener noreferrer';
			const melding = document.createElement('span');
			melding.className = 'nieuw-tabblad';
			melding.textContent = ' (opent in nieuw tabblad)';
			link.append(melding);
		}
	}

	function toonBron(node: HTMLElement, bron: string) {
		const melding = document.createElement('p');
		melding.className = 'niet-in-voorbeeld';
		melding.textContent = 'Dit diagram kan niet worden getekend.';
		const code = document.createElement('pre');
		code.textContent = bron;
		node.replaceChildren(melding, code);
	}

	/* A newer round (new text or another colour scheme) makes an older one stop writing. */
	async function renderDiagrams(huidig: ColourScheme) {
		const mijn = ++ronde;
		await tick();
		const nodes = [...(container?.querySelectorAll<HTMLElement>('.mermaid') ?? [])];
		if (nodes.length === 0) {
			vervangen = [];
			return;
		}
		const bronnen = nodes.map((node) => decodeURIComponent(node.dataset.src ?? ''));
		const site = page.params.site;
		const tokens: DiagramTokens =
			site && bronnen.some((bron) => bron.includes('var(--')) ? await siteTokens(site) : {};
		const mermaid = await loadMermaid();
		// Mermaid measures the labels while it draws; with a fallback font they come out the wrong size.
		await document.fonts.load('1em RijksSans').catch(() => []);
		if (mijn !== ronde) return;
		const onbekend = new Set<string>();
		for (const [index, node] of nodes.entries()) {
			const { source, unknown } = resolveTokens(bronnen[index], tokens, huidig);
			for (const token of unknown) onbekend.add(token);
			try {
				mermaid.initialize(mermaidConfig(huidig));
				const { svg } = await mermaid.render(`voorbeeld-diagram-${++teller}`, source);
				if (mijn !== ronde) return;
				if (node.isConnected) node.innerHTML = svg;
			} catch {
				if (mijn !== ronde) return;
				if (node.isConnected) toonBron(node, bronnen[index]);
			}
		}
		vervangen = [...onbekend];
	}
</script>

{#if vervangen.length > 0}
	<nldd-text class="kleurmelding" color="secondary" size="sm">
		Een diagram gebruikt een kleur die deze site niet kent: {vervangen.join(', ')}. Het voorbeeld
		toont die kleur grijs.
	</nldd-text>
{/if}
<div bind:this={container} aria-live="off" style:--diagram-achtergrond={diagramBackground(scheme)}>
	<nldd-rich-text>{@html html}</nldd-rich-text>
</div>

<style>
	.kleurmelding {
		display: block;
		margin-block-end: 16px;
	}
	div :global(.niet-in-voorbeeld) {
		opacity: 0.7;
		font-style: italic;
	}
	div :global(.nieuw-tabblad) {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	/* The frame the site draws around a diagram. */
	div :global(.mermaid) {
		box-sizing: border-box;
		padding: 16px;
		border-radius: 8px;
		background-color: var(--diagram-achtergrond);
		overflow: hidden;
	}
	div :global(.mermaid > svg) {
		display: block;
		margin-inline: auto;
	}
</style>
