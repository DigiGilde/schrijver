<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import type { Role } from '$lib/auth/team';
	import type { PageData } from './$types';
	import type { Resultaat } from './forms';
	import LidSheet from './LidSheet.svelte';

	type Lid = PageData['leden'][number];
	type Props = {
		site: PageData['beheer'];
		leden: Lid[];
		uitnodigingen: PageData['uitnodigingen'];
		resultaat: Resultaat | null;
	};
	let { site, leden, uitnodigingen, resultaat }: Props = $props();

	const ROL: Record<Role, string> = { beheerder: 'Beheerder', redactie: 'Redactie' };
	const datum = new Intl.DateTimeFormat('nl-NL', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'Europe/Amsterdam'
	});
	const dag = (iso: string) => datum.format(new Date(iso));

	const naam = (lid: Lid) =>
		`${lid.naam ?? lid.email ?? 'Naam onbekend'}${lid.jij ? ' (jij)' : ''}`;
	const over = (lid: Lid) =>
		[lid.naam ? lid.email : null, `sinds ${dag(lid.sinds)}`].filter(Boolean).join(' · ');

	/* The sheet shows its own refusals; the page shows what happened to the team. */
	const lijst = $derived(
		resultaat?.actie === 'intrekken' ||
			((resultaat?.actie === 'rol' || resultaat?.actie === 'verwijderen') && resultaat.melding)
			? resultaat
			: null
	);
	const toegevoegd = $derived(resultaat?.actie === 'toevoegen' ? resultaat : null);
	const melding = $derived(
		[lijst?.melding ?? lijst?.fout, toegevoegd?.melding ?? toegevoegd?.fout]
			.filter(Boolean)
			.join(' ')
	);

	let kop: HTMLElement | undefined = $state();
	let sheet: LidSheet | undefined = $state();

	let email = $state('');
	let toevoegen = $state(false);
	let emailVeld: HTMLElement | undefined = $state();

	let intrekForm: HTMLFormElement | undefined = $state();
	let intrekId = $state('');

	async function trekIn(id: string) {
		intrekId = id;
		await tick();
		intrekForm?.requestSubmit();
	}
</script>

<nldd-container gap="40">
	<nldd-container gap="16">
		<div class="kop" tabindex="-1" bind:this={kop}>
			<nldd-title size="3" heading-level="2" text="Team"></nldd-title>
		</div>
		<nldd-text
			>Het team beslist over de voorstellen voor deze site. Beheerders beheren ook het team en de
			instellingen.</nldd-text
		>
		<!-- One persistent live region: a banner inserted together with its text is not reliably announced. -->
		<p class="sr-only" role="status">{melding}</p>
		{#if lijst}
			<nldd-banner variant={lijst.fout ? 'critical' : 'success'} text={lijst.fout ?? lijst.melding}
			></nldd-banner>
		{/if}
		<nldd-list accessible-label="Team van {site.naam}">
			<nldd-inline-dialog
				slot="empty"
				text="Nog niemand in het team"
				supporting-text="Voeg hieronder iemand toe."
			></nldd-inline-dialog>
			{#each leden as lid (lid.sleutel)}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<nldd-list-item button onclick={() => sheet?.toon(lid)}>
					<nldd-text-cell hide-below="md" text={naam(lid)} supporting-text={over(lid)}
					></nldd-text-cell>
					<nldd-text-cell
						hide-above="sm"
						text={naam(lid)}
						supporting-text="{ROL[lid.rol]} · {over(lid)}"
					></nldd-text-cell>
					<nldd-spacer-cell size="8" hide-below="md"></nldd-spacer-cell>
					<nldd-text-cell hide-below="md" width="fit-content" text={ROL[lid.rol]}></nldd-text-cell>
					<nldd-spacer-cell size="8"></nldd-spacer-cell>
					<nldd-icon-cell size="20" color="secondary" icon="chevron-right"></nldd-icon-cell>
				</nldd-list-item>
			{/each}
			{#each uitnodigingen as uitnodiging (uitnodiging.id)}
				{@const status = `Uitgenodigd, nog niet ingelogd · verloopt op ${dag(uitnodiging.verloopt)}`}
				<nldd-list-item>
					<nldd-text-cell hide-below="md" text={uitnodiging.email} supporting-text={status}
					></nldd-text-cell>
					<nldd-text-cell
						hide-above="sm"
						text={uitnodiging.email}
						supporting-text="{ROL[uitnodiging.rol]} · {status}"
					></nldd-text-cell>
					<nldd-spacer-cell size="8" hide-below="md"></nldd-spacer-cell>
					<nldd-text-cell hide-below="md" width="fit-content" text={ROL[uitnodiging.rol]}
					></nldd-text-cell>
					<nldd-spacer-cell size="8"></nldd-spacer-cell>
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<nldd-list-item-segment
						button
						accessible-label="Intrekken: de uitnodiging voor {uitnodiging.email}"
						onclick={() => trekIn(uitnodiging.id)}
					>
						<nldd-text-cell width="fit-content" color="accent" text="Intrekken"></nldd-text-cell>
					</nldd-list-item-segment>
				</nldd-list-item>
			{/each}
		</nldd-list>
		<nldd-text color="secondary"
			>Collega's met schrijfrechten op de repository op GitHub horen ook bij de redactie; met
			beheerrechten daar zijn ze beheerder.</nldd-text
		>
		<form
			method="post"
			action="?/intrekken"
			hidden
			bind:this={intrekForm}
			use:enhance={() =>
				async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'success') kop?.focus();
				}}
		>
			<input type="hidden" name="id" value={intrekId} />
		</form>
	</nldd-container>

	<nldd-container gap="16">
		<nldd-title size="4" heading-level="3" text="Iemand toevoegen"></nldd-title>
		<nldd-form>
			<form
				method="post"
				action="?/toevoegen"
				novalidate
				use:enhance={() => {
					toevoegen = true;
					return async ({ result, update }) => {
						// On success update() moves the focus to the body: the field takes it back after it.
						await update({ reset: false });
						toevoegen = false;
						if (result.type === 'success') email = '';
						if (result.type === 'success' || result.type === 'failure') {
							await tick();
							emailVeld?.focus();
						}
					};
				}}
			>
				<nldd-form-field label="E-mailadres">
					<nldd-text-field
						bind:this={emailVeld}
						name="email"
						type="email"
						autocomplete="off"
						no-spellcheck
						required
						value={email}
						invalid={toegevoegd?.fout ? true : undefined}
						oninput={(e: Event) => (email = (e.target as HTMLInputElement).value)}
					></nldd-text-field>
					{#if toegevoegd?.fout}
						<nldd-form-field-help-text>{toegevoegd.fout}</nldd-form-field-help-text>
					{/if}
					<nldd-form-field-help-text
						>Het werkadres waarmee je collega inlogt bij SSO Rijk.</nldd-form-field-help-text
					>
				</nldd-form-field>
				<nldd-form-field label="Rol">
					<nldd-radio-button-group name="rol" required>
						<nldd-radio-button-field
							value="redactie"
							label="Redactie: beslist over voorstellen"
							checked
						></nldd-radio-button-field>
						<nldd-radio-button-field
							value="beheerder"
							label="Beheerder: beslist over voorstellen en beheert het team en de instellingen"
						></nldd-radio-button-field>
					</nldd-radio-button-group>
				</nldd-form-field>
				<nldd-form-actions>
					<nldd-button-group>
						<nldd-button
							appearance="primary"
							type="submit"
							text="Voeg toe"
							loading={toevoegen || undefined}
						></nldd-button>
					</nldd-button-group>
				</nldd-form-actions>
			</form>
		</nldd-form>
		{#if toegevoegd?.melding}
			<nldd-banner variant="success" text={toegevoegd.melding} supporting-text={toegevoegd.uitleg}
			></nldd-banner>
		{/if}
	</nldd-container>
</nldd-container>

<LidSheet bind:this={sheet} site={site.naam} onverwijderd={() => kop?.focus()} />

<style>
	.kop:focus {
		outline: none;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
