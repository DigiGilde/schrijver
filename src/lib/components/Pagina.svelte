<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import AppBalk from '$lib/components/AppBalk.svelte';
	import { pageReady } from '$lib/client/page-ready.svelte';

	type Props = {
		/** The h1 of the page; the sticky title bar takes it over once it scrolls away. */
		titel: string;
		ondertitel?: string;
		/** Where the back button of the title bar leads. Without it the page has no title bar. */
		terug?: { href: string; tekst: string } | null;
		/** Width of the first section, as on nldd-simple-section ('full' or a CSS length). */
		breedte?: string;
		/** Buttons at the end of the title bar; they stay in view while the page scrolls. */
		balk?: Snippet;
		/** Controls at the end of the h1 line, such as a button that changes the title. */
		titelactie?: Snippet;
		children: Snippet;
		/** Sections after the first one. */
		vervolg?: Snippet;
		/** The sticky header once it renders, for content that has to stay clear of it. */
		kop?: HTMLElement;
	};
	let {
		titel,
		ondertitel,
		terug = null,
		breedte,
		balk,
		titelactie,
		children,
		vervolg,
		kop = $bindable()
	}: Props = $props();

	const pagina = pageReady();
	let inhoud: HTMLElement | undefined = $state();
	/* On a short viewport, such as 400% zoom or a phone on its side, the header scrolls away. */
	let plakt = $state(true);

	onMount(() => {
		const query = window.matchMedia('(max-height: 500px)');
		const kijk = () => (plakt = !query.matches);
		kijk();
		query.addEventListener('change', kijk);
		return () => query.removeEventListener('change', kijk);
	});

	/*
	 * Everything that sticks while the document scrolls: the header, and the bars in the content that
	 * mark themselves with data-plakt. A fragment or a focused element has to stop below them
	 * (WCAG 2.4.11). Those bars stick only below a sticky header.
	 */
	$effect(() => {
		const header = kop;
		const content = inhoud;
		if (!header || !content || !plakt) return;
		const root = document.documentElement;
		const bars = new Set<Element>();
		const sizes = new ResizeObserver(measure);

		function measure() {
			let height = header!.getBoundingClientRect().height;
			for (const bar of bars) height += bar.getBoundingClientRect().height;
			root.style.scrollPaddingTop = `${Math.ceil(height) + 8}px`;
		}
		function watch() {
			const current = new Set(content!.querySelectorAll('[data-plakt]'));
			for (const bar of bars) {
				if (current.has(bar)) continue;
				sizes.unobserve(bar);
				bars.delete(bar);
			}
			for (const bar of current) {
				if (bars.has(bar)) continue;
				sizes.observe(bar);
				bars.add(bar);
			}
			measure();
		}

		sizes.observe(header);
		const changes = new MutationObserver(watch);
		changes.observe(content, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['data-plakt']
		});
		watch();
		return () => {
			sizes.disconnect();
			changes.disconnect();
			root.style.removeProperty('scroll-padding-top');
		};
	});
</script>

<nldd-page sticky-header={plakt || undefined}>
	<div slot="header" bind:this={kop}>
		<nldd-skip-link href="#inhoud">
			<AppBalk
				userName={page.data.userName}
				email={page.data.email}
				testEnvironment={page.data.testEnvironment}
			/>
		</nldd-skip-link>
		{#if terug && pagina.ready}
			<div class="uitgelijnd">
				<div>
					<nldd-top-title-bar
						class="optisch"
						text={titel}
						back-text={terug.tekst}
						back-href={terug.href}
						collapse-anchor="paginatitel"
					>
						{#if balk}
							<div slot="toolbar" class="balk">{@render balk()}</div>
						{/if}
					</nldd-top-title-bar>
				</div>
			</div>
		{/if}
	</div>
	<!-- The skip link target is a plain element: a shadow host with tabindex -1 takes its whole content out of the Tab order. -->
	<div id="inhoud" tabindex="-1" bind:this={inhoud}>
		<nldd-simple-section width={breedte} padding-top={terug ? '16' : undefined}>
			<nldd-title
				id="paginatitel"
				slot="header"
				size="2"
				heading-level="1"
				text={titel}
				supporting-text={ondertitel}
			>
				{#if titelactie}
					<div slot="end" class="titelactie">{@render titelactie()}</div>
				{/if}
			</nldd-title>
			{@render children()}
		</nldd-simple-section>
		{@render vervolg?.()}
	</div>
</nldd-page>

<style>
	/* The bar pads both ends and its back button the start; this puts the chevron and the last button on the content edges. */
	.optisch {
		display: block;
		width: auto;
		margin-inline: -18px -6px;
	}
	#inhoud:focus {
		outline: none;
	}
	.titelactie {
		display: contents;
	}
	.balk {
		display: flex;
		align-items: center;
		gap: 8px;
	}
</style>
