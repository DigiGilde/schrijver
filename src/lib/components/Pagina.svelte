<script lang="ts">
	import { onMount, type Snippet } from 'svelte';

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
		children,
		vervolg,
		kop = $bindable()
	}: Props = $props();

	/*
	 * The title bar finds its scroll target on the surrounding nldd-page when it connects. After
	 * server rendering the design system upgrades the title bar before the page, so the bar is only
	 * rendered once nldd-page is defined.
	 */
	let paginaGereed = $state(false);
	onMount(() => {
		void customElements.whenDefined('nldd-page').then(() => (paginaGereed = true));
	});
</script>

<nldd-page sticky-header={terug ? true : undefined}>
	{#if terug && paginaGereed}
		<div slot="header" class="uitgelijnd" bind:this={kop}>
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
	<!-- The skip link target is a plain element: a shadow host with tabindex -1 takes its whole content out of the Tab order. -->
	<div id="inhoud" tabindex="-1">
		<nldd-simple-section width={breedte} padding-top={terug ? '16' : undefined}>
			<nldd-title
				id="paginatitel"
				slot="header"
				size="2"
				heading-level="1"
				text={titel}
				supporting-text={ondertitel}
			></nldd-title>
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
	.balk {
		display: flex;
		align-items: center;
		gap: 8px;
	}
</style>
