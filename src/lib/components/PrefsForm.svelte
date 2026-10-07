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

		{#if selected === 'gekoppeld'}
			<nldd-form-field label="GitHub-gebruikersnaam">
				<nldd-text-field name="githubLogin" value={githubLogin} required no-spellcheck autocomplete="off"
				></nldd-text-field>
			</nldd-form-field>
		{/if}

		<nldd-form-actions>
			<nldd-button-group>
				<nldd-button appearance="primary" type="submit" text="Opslaan" loading={busy}></nldd-button>
			</nldd-button-group>
		</nldd-form-actions>
	</form>
</nldd-form>
