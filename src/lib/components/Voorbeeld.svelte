<script lang="ts">
	import { tick } from 'svelte';
	import { markdownToHtml, type ResolveImage } from '$lib/content/markdown-preview';

	type Props = { value: string; resolveImage?: ResolveImage };
	let { value, resolveImage }: Props = $props();

	const DEBOUNCE_MS = 300;

	let html = $state('');
	let container: HTMLElement | undefined = $state();
	let first = true;

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
		void renderDiagrams();
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

	async function renderDiagrams() {
		await tick();
		const nodes = [...(container?.querySelectorAll<HTMLElement>('.mermaid') ?? [])];
		if (nodes.length === 0) return;
		const { default: mermaid } = await import('mermaid');
		mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
		for (const node of nodes) {
			if (!node.isConnected) continue;
			const fallback = node.innerHTML;
			try {
				node.textContent = decodeURIComponent(node.dataset.src ?? '');
				await mermaid.run({ nodes: [node] });
			} catch {
				node.innerHTML = fallback;
			}
		}
	}
</script>

<div bind:this={container} aria-live="off">
	<nldd-rich-text>{@html html}</nldd-rich-text>
</div>

<style>
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
</style>
