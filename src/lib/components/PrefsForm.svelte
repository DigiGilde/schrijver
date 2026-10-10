<script lang="ts">
	import { enhance } from '$app/forms';

	type Kind = 'anoniem' | 'gekoppeld' | 'op-naam';
	type Props = {
		identity: string;
		githubLogin: string;
		emailVerified: boolean;
		sites: { naam: string; toegestaan: Kind[] }[];
		error?: string;
		saved?: boolean;
		justLinked?: boolean;
		headings?: boolean;
	};
	let {
		identity,
		githubLogin,
		emailVerified,
		sites,
		error,
		saved,
		justLinked,
		headings = false
	}: Props = $props();

	const NAAM: Record<Kind, string> = {
		anoniem: 'anoniem',
		gekoppeld: 'gekoppeld aan GitHub',
		'op-naam': 'op naam'
	};

	// svelte-ignore state_referenced_locally
	let selected = $state(identity);
	let busy = $state(false);
	let unlinking = $state(false);
	const linked = $derived(githubLogin !== '');

	/*
	 * Mirrors effectiveKind in $lib/auth/identity: the choice where the site allows it, else the site's
	 * first usable kind that reveals no more than the choice.
	 */
	const REVEALS: Record<Kind, number> = { anoniem: 0, gekoppeld: 1, 'op-naam': 2 };
	const usable = (kind: Kind) =>
		kind === 'anoniem' || (kind === 'gekoppeld' ? linked : emailVerified);
	const afwijkend = $derived.by(() => {
		const keuze = (usable(selected as Kind) ? selected : 'anoniem') as Kind;
		return sites
			.filter((site) => keuze !== 'anoniem' && !site.toegestaan.includes(keuze))
			.map((site) => ({
				naam: site.naam,
				wordt: site.toegestaan.find((k) => usable(k) && REVEALS[k] <= REVEALS[keuze]) ?? 'anoniem'
			}));
	});
	function onChange(e: Event) {
		const value = (e as CustomEvent<{ value?: string }>).detail?.value;
		if (value) selected = value;
	}
</script>

<!-- One persistent live region: a banner inserted together with its text is not reliably announced. -->
<p class="sr-only" role="status">
	{error ?? (saved ? 'Instellingen bewaard' : justLinked ? 'Je GitHub-account is gekoppeld' : '')}
</p>
{#if error}
	<nldd-banner variant="critical" text={error}></nldd-banner>
{/if}
{#if saved}
	<nldd-banner variant="success" text="Instellingen bewaard"></nldd-banner>
{/if}
{#if justLinked}
	<nldd-banner
		variant="success"
		text={'Je GitHub-account is gekoppeld. Kies hieronder "Gekoppeld aan GitHub" en kies "Bewaar" als je zo wilt ondertekenen.'}
	></nldd-banner>
{/if}

<nldd-container gap="16">
	{#if headings}
		<nldd-title size="3" heading-level="2" text="Ondertekenen"></nldd-title>
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
						label="Anoniem (standaard): je naam komt nergens in GitHub. Schrijver geeft je een vaste codenaam."
						checked={selected === 'anoniem' || undefined}
					></nldd-radio-button-field>
					<nldd-radio-button-field
						value="gekoppeld"
						label="Gekoppeld aan GitHub: je GitHub-gebruikersnaam staat bij de wijziging en die telt mee op je GitHub-profiel. Je naam en werkadres blijven verborgen."
						checked={selected === 'gekoppeld' || undefined}
						disabled={!linked || undefined}
					></nldd-radio-button-field>
					<nldd-radio-button-field
						value="op-naam"
						label="Op naam: je naam en e-mailadres staan bij de wijziging."
						checked={selected === 'op-naam' || undefined}
						disabled={!emailVerified || undefined}
					></nldd-radio-button-field>
				</nldd-radio-button-group>
				{#if !linked}
					<nldd-form-field-help-text
						>"Gekoppeld aan GitHub" kan pas als je hieronder je GitHub-account koppelt.</nldd-form-field-help-text
					>
				{/if}
				{#if !emailVerified}
					<nldd-form-field-help-text
						>"Op naam" kan alleen met een geverifieerd e-mailadres.</nldd-form-field-help-text
					>
				{/if}
				<nldd-form-field-help-text>
					Wat met "Gekoppeld aan GitHub" of "Op naam" in een openbare repository komt, blijft daar
					voorgoed zichtbaar: de geschiedenis kan niet worden gewist, ook niet als je later iets
					anders kiest.
				</nldd-form-field-help-text>
			</nldd-form-field>

			{#if afwijkend.length > 0}
				<div>
					<nldd-text>Niet elke site staat deze keuze toe:</nldd-text>
					<ul>
						{#each afwijkend as site (site.naam)}
							<li>Op {site.naam} onderteken je {NAAM[site.wordt]}.</li>
						{/each}
					</ul>
				</div>
			{/if}

			<nldd-form-actions>
				<nldd-button-group>
					<nldd-button appearance="primary" type="submit" text="Bewaar" loading={busy || undefined}
					></nldd-button>
				</nldd-button-group>
			</nldd-form-actions>
		</form>
	</nldd-form>
</nldd-container>

<nldd-container gap="8">
	{#if headings}
		<nldd-title size="3" heading-level="2" text="GitHub-account"></nldd-title>
	{/if}
	{#if linked}
		<p>Gekoppeld aan GitHub-account {githubLogin}</p>
		<form
			method="post"
			action="?/ontkoppel"
			use:enhance={() => {
				unlinking = true;
				return async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'success' && typeof result.data?.identity === 'string')
						selected = result.data.identity;
					unlinking = false;
				};
			}}
		>
			<nldd-button
				appearance="secondary"
				type="submit"
				text="Ontkoppel GitHub-account"
				loading={unlinking || undefined}
			></nldd-button>
		</form>
	{:else}
		<form method="post" action="/login/github" data-sveltekit-reload>
			<nldd-button appearance="secondary" type="submit" text="GitHub-account koppelen"
			></nldd-button>
		</form>
	{/if}
</nldd-container>

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
