<script lang="ts">
	type Props = {
		/** Name and address of the signed-in user; without a user the bar shows only the wordmark. */
		userName: string | null;
		email: string | null;
		/** The local preview, where nothing reaches GitHub. */
		testEnvironment: boolean;
	};
	let { userName, email, testEnvironment }: Props = $props();

	const navigation = [
		{ text: 'Sites', icon: 'globe', href: '/' },
		{ text: 'Help', icon: 'help', href: '/help' }
	];
	const account = [
		{ text: 'Instellingen', icon: 'settings', href: '/instellingen' },
		{ text: 'Uitloggen', icon: 'logout', href: '/instellingen#uitloggen' }
	];

	const name = $derived(userName?.trim() || email || '');
	const address = $derived(email && email !== name ? email : undefined);

	/** An item with an href renders as a link: Enter follows it, Space would only scroll the page behind the menu. */
	function followOnSpace(event: KeyboardEvent) {
		const target = event.composedPath()[0];
		if (event.key !== ' ' || !(target instanceof HTMLAnchorElement)) return;
		event.preventDefault();
		target.click();
	}
</script>

{#if testEnvironment}
	<nldd-status-bar
		variant="warning"
		text="Testomgeving: wat je bewaart blijft op deze computer en gaat niet naar GitHub."
	></nldd-status-bar>
{/if}
<div class="uitgelijnd appbalk">
	<nldd-toolbar label="Schrijver">
		<!--
			The wordmark carries the name, so the title has no `text`: with both, the name is read twice. The
			minimum width is the wordmark's: the default of 200px would send the menu to the overflow sooner.
		-->
		<nldd-toolbar-title slot="start" href="/" min-width="9rem">
			<span slot="media" class="merk" role="img" aria-label="Schrijver">
				<span class="blok" aria-hidden="true"
					><nldd-icon icon="file-text-pencil" size="24"></nldd-icon></span
				>
				<span class="woord" aria-hidden="true">Schrijver</span>
			</span>
		</nldd-toolbar-title>
		{#if userName !== null}
			<nldd-toolbar-item slot="end">
				<nldd-button
					class="menuknop"
					appearance="neutral-transparent"
					text="Menu"
					start-icon="menu"
					popup-type="menu"
				>
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<nldd-menu slot="popup" placement="bottom-end" onkeydown={followOnSpace}>
						<nldd-container slot="header" padding="12">
							<nldd-identity text={name} supporting-text={address}></nldd-identity>
						</nldd-container>
						{#each navigation as choice (choice.href)}
							<nldd-menu-item text={choice.text} icon={choice.icon} href={choice.href}
							></nldd-menu-item>
						{/each}
						<nldd-menu-group text="Account">
							{#each account as choice (choice.href)}
								<nldd-menu-item text={choice.text} icon={choice.icon} href={choice.href}
								></nldd-menu-item>
							{/each}
						</nldd-menu-group>
					</nldd-menu>
				</nldd-button>
				<!-- When the item does not fit, the toolbar hides the button and clones only what sits in this slot. -->
				{#each navigation as choice (choice.href)}
					<nldd-menu-item slot="overflow" text={choice.text} icon={choice.icon} href={choice.href}
					></nldd-menu-item>
				{/each}
				<!-- The overflow menu has no header slot: the group's name says whose account it is. -->
				<nldd-menu-group slot="overflow" text="Account, {name}">
					{#each account as choice (choice.href)}
						<nldd-menu-item text={choice.text} icon={choice.icon} href={choice.href}
						></nldd-menu-item>
					{/each}
				</nldd-menu-group>
			</nldd-toolbar-item>
		{/if}
	</nldd-toolbar>
</div>

<style>
	.appbalk {
		padding-block: var(--primitives-space-8);
	}
	.merk {
		display: inline-flex;
		align-items: center;
		gap: var(--primitives-space-4);
		font: var(--primitives-font-display-3-sm);
	}
	.blok {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--primitives-space-40);
		height: var(--primitives-space-40);
		border-radius: var(--primitives-corner-radius-sm);
		background: var(--semantics-categories-accent-filled-background-color);
		color: var(--semantics-categories-accent-filled-content-color);
	}
</style>
