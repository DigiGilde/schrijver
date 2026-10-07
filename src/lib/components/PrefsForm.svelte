<script lang="ts">
	import { enhance } from '$app/forms';

	type Props = {
		identity: string;
		githubLogin: string;
		emailVerified: boolean;
		error?: string;
		saved?: boolean;
	};
	let { identity, githubLogin, emailVerified, error, saved }: Props = $props();

	// svelte-ignore state_referenced_locally
	let selected = $state(identity);
	let busy = $state(false);
	let unlinking = $state(false);
	const linked = $derived(githubLogin !== '');

	function onChange(e: Event) {
		const value = (e as CustomEvent<{ value?: string }>).detail?.value;
		if (value) selected = value;
	}
</script>

{#if error}
	<nldd-banner variant="critical" text={error}></nldd-banner>
{/if}
{#if saved}
	<nldd-banner variant="success" text="Instellingen opgeslagen"></nldd-banner>
{/if}

<nldd-form>
	<form
		method="post"
		action="?/opslaan"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update({ reset: false });
				busy = false;
			};
		}}
	>
		<nldd-form-field label="Hoe wil je je wijzigingen ondertekenen?">
			<nldd-radio-button-group name="identity" required onchange={onChange}>
				<nldd-radio-button-field
					value="anoniem"
					label="Anoniem (standaard): je naam komt nergens in GitHub. Schrijver geeft je een vast pseudoniem."
					checked={selected === 'anoniem'}
				></nldd-radio-button-field>
				<nldd-radio-button-field
					value="gekoppeld"
					label="Gekoppeld aan mijn GitHub-account: wijzigingen tellen mee op je GitHub-profiel, je werkadres blijft verborgen."
					checked={selected === 'gekoppeld'}
					disabled={!linked}
				></nldd-radio-button-field>
				<nldd-radio-button-field
					value="op-naam"
					label="Op naam: je naam en e-mailadres staan bij de wijziging."
					checked={selected === 'op-naam'}
					disabled={!emailVerified}
				></nldd-radio-button-field>
			</nldd-radio-button-group>
			{#if !emailVerified}
				<nldd-form-field-help-text>Alleen mogelijk met een geverifieerd e-mailadres</nldd-form-field-help-text>
			{/if}
		</nldd-form-field>

		<nldd-form-actions>
			<nldd-button-group>
				<nldd-button appearance="primary" type="submit" text="Opslaan" loading={busy}></nldd-button>
			</nldd-button-group>
		</nldd-form-actions>
	</form>
</nldd-form>

<nldd-container gap="8">
	{#if linked}
		<p>Gekoppeld aan GitHub-account {githubLogin}</p>
		<form
			method="post"
			action="?/ontkoppel"
			use:enhance={() => {
				unlinking = true;
				return async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'success' && typeof result.data?.identity === 'string') selected = result.data.identity;
					unlinking = false;
				};
			}}
		>
			<nldd-button appearance="secondary" type="submit" text="Koppeling verwijderen" loading={unlinking}></nldd-button>
		</form>
	{:else}
		<nldd-button appearance="secondary" href="/login/github?kies=gekoppeld" text="Koppel je GitHub-account"></nldd-button>
	{/if}
</nldd-container>
