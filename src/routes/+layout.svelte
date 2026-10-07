<script lang="ts">
	import '@nldd/design-system/styles';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		import('@nldd/design-system');
	});
</script>

<nldd-app-view>
	<nldd-page>
		<nldd-skip-link slot="header">
			<nldd-top-navigation-bar website-title="Schrijver"></nldd-top-navigation-bar>
		</nldd-skip-link>
		{@render children()}
	</nldd-page>
</nldd-app-view>
