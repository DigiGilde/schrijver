<script lang="ts">
	import '@nldd/design-system/styles';
	import favicon from '@nldd/design-system/favicon.svg';
	import touchIcon from '@nldd/design-system/touch-icon.png';
	import { onMount } from 'svelte';

	let { children, data } = $props();

	onMount(() => {
		import('@nldd/design-system');
	});
</script>

<svelte:head>
	<link rel="icon" type="image/svg+xml" href={favicon} />
	<link rel="apple-touch-icon" href={touchIcon} />
</svelte:head>

<nldd-app-view>
	<nldd-bar-split-view>
		<nldd-split-view-pane slot="hoofdbalk">
			<nldd-skip-link href="#inhoud">
				<div class="hoofdbalk uitgelijnd">
					<nldd-toolbar label="Schrijver">
						<nldd-toolbar-title slot="start" href="/" text="Schrijver"></nldd-toolbar-title>
						{#if data.userName}
							<nldd-toolbar-item slot="end">
								<nldd-icon-button icon="account" text="Account van {data.userName}" expandable>
									<nldd-menu slot="popup" placement="bottom-end">
										<nldd-menu-item icon="settings" text="Instellingen" href="/instellingen"
										></nldd-menu-item>
										<nldd-menu-item icon="help" text="Help" href="/help"></nldd-menu-item>
										<nldd-menu-divider></nldd-menu-divider>
										<nldd-menu-item icon="logout" text="Uitloggen" href="/instellingen#uitloggen"
										></nldd-menu-item>
									</nldd-menu>
								</nldd-icon-button>
								<nldd-menu-group slot="overflow" text="Account van {data.userName}">
									<nldd-menu-item icon="settings" text="Instellingen" href="/instellingen"
									></nldd-menu-item>
									<nldd-menu-item icon="help" text="Help" href="/help"></nldd-menu-item>
									<nldd-menu-item icon="logout" text="Uitloggen" href="/instellingen#uitloggen"
									></nldd-menu-item>
								</nldd-menu-group>
							</nldd-toolbar-item>
						{/if}
					</nldd-toolbar>
				</div>
			</nldd-skip-link>
		</nldd-split-view-pane>
		<nldd-split-view-pane slot="main">
			{@render children()}
		</nldd-split-view-pane>
	</nldd-bar-split-view>
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
	.hoofdbalk {
		padding-block: 8px;
	}
	/*
	 * The app bar and the page title bar stick while the document scrolls (61px and 50px). Scrolling
	 * to a fragment or a focused element has to stop below them (WCAG 2.4.11).
	 */
	:global(:root) {
		scroll-padding-top: 72px;
	}
	:global(:root:has(nldd-top-title-bar)) {
		scroll-padding-top: 122px;
	}
</style>
