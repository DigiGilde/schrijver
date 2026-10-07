<script lang="ts">
	import { tick } from 'svelte';
	import { markdownToHtml } from '$lib/content/markdown-preview';

	type Props = { value: string };
	let { value }: Props = $props();

	const DEBOUNCE_MS = 300;

	let html = $state('');
	let container: HTMLElement | undefined = $state();
	let first = true;

	$effect(() => {
		const current = value;
		const delay = first ? 0 : DEBOUNCE_MS;
		first = false;
		const timer = setTimeout(() => {
			html = markdownToHtml(current);
		}, delay);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		void html;
		void renderDiagrams();
	});

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
</style>
