<script lang="ts">
	import '@nldd/design-system/styles';
	import favicon from '@nldd/design-system/favicon.svg';
	import touchIcon from '@nldd/design-system/touch-icon.png';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		import('@nldd/design-system');
	});
</script>

<svelte:head>
	<link rel="icon" type="image/svg+xml" href={favicon} />
	<link rel="apple-touch-icon" href={touchIcon} />
</svelte:head>

<nldd-app-view>
	{@render children()}
</nldd-app-view>

<style>
	/* Bars draw no gutter of their own; these are the page-section margins, so bars line up with the content. */
	:global(.uitgelijnd) {
		display: flex;
		justify-content: center;
		container-type: inline-size;
	}
	:global(.uitgelijnd > *) {
		flex: 1 1 auto;
		min-width: 0;
		max-width: var(--semantics-page-sections-body-max-width);
		margin-inline: var(--semantics-page-sections-sm-margin-inline);
	}
	@container (min-width: 641px) and (max-width: 1007px) {
		:global(.uitgelijnd > *) {
			margin-inline: var(--semantics-page-sections-md-margin-inline);
		}
	}
	@container (min-width: 1008px) {
		:global(.uitgelijnd > *) {
			margin-inline: var(--semantics-page-sections-lg-margin-inline);
		}
	}
</style>
