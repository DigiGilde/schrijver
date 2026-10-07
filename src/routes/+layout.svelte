<script lang="ts">
	import '@nldd/design-system/styles';
	import { onMount } from 'svelte';

	let { children, data } = $props();

	onMount(() => {
		import('@nldd/design-system');
	});
</script>

<nldd-app-view>
	<nldd-page>
		<nldd-skip-link slot="header">
			<nldd-top-navigation-bar website-title="Schrijver">
				{#if data.userName}
					<nldd-menu-bar slot="utility" accessible-label="Gebruiker">
						<nldd-menu-bar-item text={data.userName} href="/instellingen"></nldd-menu-bar-item>
						<nldd-menu-bar-item text="Help" href="/help"></nldd-menu-bar-item>
					</nldd-menu-bar>
				{/if}
			</nldd-top-navigation-bar>
		</nldd-skip-link>
		{@render children()}
	</nldd-page>
</nldd-app-view>
